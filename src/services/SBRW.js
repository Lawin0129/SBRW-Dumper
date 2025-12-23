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

        if (serverList.status >= 300) throw serverList;
    
        let servers = serverList.data
            .map(s => ({
                id: s.id,
                category: s.category,
                name: s.name,
                url: s.ip_address
            }));
        
        return servers;
    }
    
    #serverUrl;
    #account;
    #gameCredentials;
    #personas;
    #authHeaders;
    constructor(serverUrl) {
        this.#serverUrl = serverUrl;
        this.#account = {
            loginToken: "",
            userId: 0
        };
        this.#gameCredentials = {
            securityToken: "",
            userId: 0
        };
        this.#personas = [];

        this.#authHeaders = {
            ...SBRW.baseAuthenticationHeaders,
            "X-HWID": generateRandomHwid(),
            "X-HiddenHWID": generateRandomHwid()
        };
    }

    get serverUrl() {
        return this.#serverUrl;
    }

    get account() {
        return { ...this.#account };
    }

    get gameCredentials() {
        return { ...this.#gameCredentials };
    }
    
    get personas() {
        return [...this.#personas];
    }

    get authHeaders() {
        return { ...this.#authHeaders };
    }

    async getServerInformation() {
        const serverInfo = await request.get(`${this.#serverUrl}/GetServerInformation`, SBRW.baseHeaders);
        
        return serverInfo;
    }
    
    async authenticateUser(email, password) {
        const serverInfo = await this.getServerInformation();
        if (serverInfo.status >= 300) throw serverInfo;

        let modernAuth = serverInfo.data.modernAuthSupport || false;
        
        // authenticate user
        if (!modernAuth) {
            const auth = await request.get(
                `${this.#serverUrl}/User/authenticateUser?email=${email}&password=${crypto.createHash("sha1").update(password).digest("hex")}`,
                this.#authHeaders
            );

            if (auth.status >= 300) throw auth;
            
            let authData = await xmlParser.parseXML(auth.data);
            
            this.#account.loginToken = authData.LoginStatusVO.LoginToken[0];
            this.#account.userId = authData.LoginStatusVO.UserId[0];
        } else {
            const newAuth = await request.post(
                `${this.#serverUrl}/User/modernAuth`,
                { email: email, password: password, upgrade: true },
                this.#authHeaders
            );

            if (newAuth.status >= 300) throw newAuth;
            
            this.#account.loginToken = newAuth.data.token;
            this.#account.userId = newAuth.data.userId;
        }
        
        // get game session when authenticated
        const session = await request.post(
            `${this.#serverUrl}/User/GetPermanentSession`,
            '<GetPermanentSessionData xmlns="http://schemas.datacontract.org/2004/07/Victory.DataLayer.Serialization" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><machineID>000000000000000000</machineID><version>637</version></GetPermanentSessionData>',
            SBRW.gameHeaders(this.#account.loginToken, this.#account.userId)
        );

        if (session.status >= 300) throw session;

        let sessionData = await xmlParser.parseXML(session.data);

        this.#gameCredentials.securityToken = sessionData.UserInfo.user[0].securityToken[0];
        this.#gameCredentials.userId = parseInt(sessionData.UserInfo.user[0].userId?.[0]) || 0;
        
        if (Array.isArray(sessionData.UserInfo?.personas?.[0]?.ProfileData)) {
            this.#personas = sessionData.UserInfo.personas[0].ProfileData.map(
                profileData => Object.freeze({
                    personaId: profileData.PersonaId[0],
                    name: profileData.Name[0]
                })
            );
        }

        return session;
    }
    
    async secureLogout(personaId) {
        const logout = await request.post(
            `${this.#serverUrl}/User/SecureLogout?userId=${this.#gameCredentials.userId}&personaId=${personaId}&exitCode=0`,
            "",
            SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
        );

        return logout;
    }
    
    async secureLoginPersona(personaId) {
        const loginPersona = await request.post(
            `${this.#serverUrl}/User/SecureLoginPersona?userId=${this.#gameCredentials.userId}&personaId=${personaId}`,
            "",
            SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
        );

        return loginPersona;
    }
    
    async getDefaultCar(personaId) {
        const defaultCar = await request.get(
            `${this.#serverUrl}/personas/${personaId}/defaultcar`,
            SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
        );

        return defaultCar;
    }
    
    async getCarslots(personaId, { dumpSomeone = false } = {}) {
        let cars = "carslots";
        if (dumpSomeone) cars = "cars";
        
        const carslots = await request.get(
            `${this.#serverUrl}/personas/${personaId}/${cars}?language=EN`,
            SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
        );
        
        return carslots;
    }
    
    async getTreasureHunt() {
        const treasureHunt = await request.get(
            `${this.#serverUrl}/events/gettreasurehunteventsession`,
            SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
        );

        return treasureHunt;
    }
    
    async getFriendsList() {
        const friendsList = await request.get(
            `${this.#serverUrl}/getfriendlistfromuserid?userId=${this.#gameCredentials.userId}`,
            SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
        );
        
        return friendsList;
    }
    
    async getAchievements() {
        const achievements = await request.get(
            `${this.#serverUrl}/achievements/loadall`,
            SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
        );
        
        return achievements;
    }
    
    async getPersonaPresence(driverName) {
        const personaPresence = await request.get(
            `${this.#serverUrl}/DriverPersona/GetPersonaPresenceByName?displayName=${driverName}`,
            SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
        );
        
        return personaPresence;
    }
    
    async getPersonaInfo(personaId) {
        const personaInfo = await request.get(
            `${this.#serverUrl}/DriverPersona/GetPersonaInfo?personaId=${personaId}`,
            SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
        );

        return personaInfo;
    }
    
    async getPersonaBaseInfo(personaId) {
        const personaBase = await request.post(
            `${this.#serverUrl}/DriverPersona/GetPersonaBaseFromList`,
            `<PersonaIdArray xmlns="http://schemas.datacontract.org/2004/07/Victory.TransferObjects.DriverPersona" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><PersonaIds xmlns:array="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><array:long>${personaId}</array:long></PersonaIds></PersonaIdArray>`,
            SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
        );

        return personaBase;
    }
    
    async getInventory() {
        const inventory = await request.get(
            `${this.#serverUrl}/personas/inventory/objects`,
            SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId)
        );

        return inventory;
    }
}

function generateRandomHwid() {
    const randomData = crypto.randomBytes(16).toString("hex");
    const hash = crypto.createHash("sha1").update(randomData).digest("hex").toUpperCase();

    return hash;
}

module.exports = SBRW;
