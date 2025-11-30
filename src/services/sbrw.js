const request = require("../utils/request");
const crypto = require("crypto");
const xmlParser = require("../utils/xmlParser");

class SBRW {
    // SBRW Launcher version
    static version = "2.2.4";

    // SBRW.Launcher.exe SHA-1 hash
    static versionHash = "9F89E2ABABEC7F8D78C97A646FB8D46894CE96F9";

    static baseHeaders = {
        "Cache-Control": "no-store,no-cache",
        "Pragma": "no-cache",
        "User-Agent": `SBRW Launcher ${SBRW.version} (+https://github.com/SoapBoxRaceWorld/GameLauncher_NFSW)`,
        "Connection": "Close"
    };

    static baseAuthenticationHeaders = {
        "Cache-Control": "no-store,no-cache",
        "Pragma": "no-cache",
        "User-Agent": `SBRW Launcher ${SBRW.version} (+https://github.com/SoapBoxRaceWorld/GameLauncher_NFSW)`,
        "X-UserAgent": `GameLauncherReborn ${SBRW.version} WinForms (+https://github.com/SoapBoxRaceWorld/GameLauncher_NFSW)`,
        "X-GameLauncherHash": SBRW.versionHash,
        "X-GameLauncherCertificate": "0000000000000000"
    };
    
    static gameHeaders(securityToken, userId) {
        return {
            "securityToken": securityToken,
            "userId": `${userId}`,
            "Accept-Encoding": "gzip,deflate",
            "User-Agent": "EA/2.0 (compatible)",
            "Content-Type": "text/xml; charset=utf-8"
        }
    }

    static async getServerList() {
        const serverList = await request.get("https://api.worldunited.gg/serverlist.json", SBRW.baseHeaders);
    
        let servers = serverList.data.filter(s => s.category == "SBRW")
            .map(s => ({
                id: s.id,
                name: s.name,
                url: s.ip_address
            }));
        
        return servers;
    }
    
    #server_ip;
    #account;
    #gameCredentials;
    #authHeaders;
    constructor(server_ip) {
        this.#server_ip = server_ip;
        this.#account = {
            loginToken: "",
            userId: 0
        };
        this.#gameCredentials = {
            securityToken: "",
            userId: 0
        };

        this.#authHeaders = {
            ...SBRW.baseAuthenticationHeaders,
            "X-HWID": generateRandomHwid(),
            "X-HiddenHWID": generateRandomHwid()
        };
    }

    get server_ip() {
        return this.#server_ip;
    }

    get account() {
        return { ...this.#account };
    }

    get gameCredentials() {
        return { ...this.#gameCredentials };
    }

    get authHeaders() {
        return { ...this.#authHeaders };
    }

    async getServerInformation() {
        const serverInfo = await request.get(`${this.#server_ip}/GetServerInformation`, SBRW.baseHeaders);
        
        return serverInfo;
    }
    
    async authenticateUser(email, password) {
        const serverInfo = await this.getServerInformation();
        let modernAuth = serverInfo.data.modernAuthSupport || false;
        
        // authenticate user
        if (!modernAuth) {
            const auth = await request.get(`${this.#server_ip}/User/authenticateUser?email=${email}&password=${crypto.createHash("sha1").update(password).digest("hex")}`, this.authHeaders);
            
            let authData = await xmlParser.parseXML(auth.data);
            
            this.#account.loginToken = authData.LoginStatusVO.LoginToken[0];
            this.#account.userId = authData.LoginStatusVO.UserId[0];
        } else {
            const newAuth = await request.post(`${this.#server_ip}/User/modernAuth`, { email: email, password: password, upgrade: true }, this.authHeaders);
            
            this.#account.loginToken = newAuth.data.token;
            this.#account.userId = newAuth.data.userId;
        }
        
        // get game session when authenticated
        const session = await request
            .post(`${this.#server_ip}/User/GetPermanentSession`,
                  '<GetPermanentSessionData xmlns="http://schemas.datacontract.org/2004/07/Victory.DataLayer.Serialization" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><machineID>000000000000000000</machineID><version>637</version></GetPermanentSessionData>',
                  SBRW.gameHeaders(this.#account.loginToken, this.#account.userId)
                 );

        let sessionData = await xmlParser.parseXML(session.data);

        this.#gameCredentials.securityToken = sessionData.UserInfo.user[0].securityToken[0];
        this.#gameCredentials.userId = parseInt(sessionData.UserInfo.user[0].userId?.[0]) || 0;

        return session;
    }
    
    async secureLogout(personaId) {
        const Logout = await request
            .post(`${this.#server_ip}/User/SecureLogout?userId=${this.#gameCredentials.userId}&personaId=${personaId}&exitCode=0`,
                  "",
                  SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
                 );

        return Logout;
    }
    
    async secureLoginPersona(personaId) {
        const loginPersona = await request
            .post(`${this.#server_ip}/User/SecureLoginPersona?userId=${this.#gameCredentials.userId}&personaId=${personaId}`,
                  "",
                  SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
                 );

        return loginPersona;
    }
    
    async getDefaultCar(personaId) {
        const defaultCar = await request
            .get(`${this.#server_ip}/personas/${personaId}/defaultcar`,
                 SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
                );

        return defaultCar;
    }
    
    async getCarSlots(personaId, { dumpSomeone = false } = {}) {
        let cars = "carslots";
        if (dumpSomeone) cars = "cars";
        
        const Carslots = await request
            .get(`${this.#server_ip}/personas/${personaId}/${cars}?language=EN`,
                 SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
                );
        
        return Carslots;
    }
    
    async getTreasureHunt() {
        const TreasureHunt = await request
            .get(`${this.#server_ip}/events/gettreasurehunteventsession`,
                 SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
                );

        return TreasureHunt;
    }
    
    async getFriendsList() {
        const FriendsList = await request
            .get(`${this.#server_ip}/getfriendlistfromuserid?userId=${this.#gameCredentials.userId}`,
                 SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
                );
        
        return FriendsList;
    }
    
    async getAchievements() {
        const Achievements = await request
            .get(`${this.#server_ip}/achievements/loadall`,
                 SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
                );
        
        return Achievements;
    }
    
    async getPersonaPresence(driverName) {
        const PersonaPresence = await request
            .get(`${this.#server_ip}/DriverPersona/GetPersonaPresenceByName?displayName=${driverName}`,
                 SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
                );
        
        return PersonaPresence;
    }
    
    async getPersonaInfo(personaId) {
        const PersonaInfo = await request
            .get(`${this.#server_ip}/DriverPersona/GetPersonaInfo?personaId=${personaId}`,
                 SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
                );

        return PersonaInfo;
    }
    
    async getPersonaBase(personaId) {
        const PersonaBase = await request
            .post(`${this.#server_ip}/DriverPersona/GetPersonaBaseFromList`,
                  `<PersonaIdArray xmlns="http://schemas.datacontract.org/2004/07/Victory.TransferObjects.DriverPersona" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><PersonaIds xmlns:array="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><array:long>${personaId}</array:long></PersonaIds></PersonaIdArray>`,
                  SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
                 );

        return PersonaBase;
    }
    
    async getInventory() {
        const Inventory = await request
            .get(`${this.#server_ip}/personas/inventory/objects`,
                 SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
                );

        return Inventory;
    }
}

function generateRandomHwid() {
    const randomData = crypto.randomBytes(16).toString("hex");
    const hash = crypto.createHash("sha1").update(randomData).digest("hex").toUpperCase();

    return hash;
}

module.exports = SBRW;
