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
    #authenticated;
    #account;
    #gameCredentials;
    #personas;
    #authHeaders;
    constructor(serverUrl) {
        this.#serverUrl = serverUrl;
        this.#authHeaders = {
            ...SBRW.baseAuthenticationHeaders,
            "X-HWID": generateRandomHwid(),
            "X-HiddenHWID": generateRandomHwid()
        };
        this.#init();
    }

    #init() {
        this.#authenticated = false;
        this.#account = {
            email: "",
            loginToken: "",
            userId: 0
        };
        this.#gameCredentials = {
            securityToken: "",
            userId: 0
        };
        this.#personas = {
            activePersonaId: 0,
            list: []
        };
    }

    get serverUrl() {
        return this.#serverUrl;
    }

    get authenticated() {
        return this.#authenticated;
    }

    get account() {
        return { ...this.#account };
    }

    get gameCredentials() {
        return { ...this.#gameCredentials };
    }
    
    get personas() {
        return { ...this.#personas, list: [...this.#personas.list] };
    }

    get authHeaders() {
        return { ...this.#authHeaders };
    }

    async getServerInformation() {
        const serverInfo = await request.get(`${this.#serverUrl}/GetServerInformation`, SBRW.baseHeaders);
        
        return serverInfo;
    }
    
    async authenticateUser(email, password) {
        if (this.#authenticated) {
            const logout = await this.secureLogout();

            if (logout.status >= 300) this.#init();
        }

        let loginToken;
        let userId;

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
            
            loginToken = authData.LoginStatusVO.LoginToken[0];
            userId = authData.LoginStatusVO.UserId[0];
        } else {
            const newAuth = await request.post(
                `${this.#serverUrl}/User/modernAuth`,
                { email: email, password: password, upgrade: true },
                this.#authHeaders
            );

            if (newAuth.status >= 300) throw newAuth;
            
            loginToken = newAuth.data.token;
            userId = newAuth.data.userId;
        }
        
        // get game session when authenticated
        const session = await request.post(
            `${this.#serverUrl}/User/GetPermanentSession`,
            '<GetPermanentSessionData xmlns="http://schemas.datacontract.org/2004/07/Victory.DataLayer.Serialization" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><machineID>000000000000000000</machineID><version>637</version></GetPermanentSessionData>',
            SBRW.gameHeaders(loginToken, userId)
        );

        if (session.status >= 300) throw session;

        let sessionData = await xmlParser.parseXML(session.data);

        if (Array.isArray(sessionData.UserInfo?.personas?.[0]?.ProfileData)) {
            this.#personas.list = sessionData.UserInfo.personas[0].ProfileData.map(
                profileData => Object.freeze({
                    id: profileData.PersonaId[0],
                    name: profileData.Name[0]
                })
            );
        }

        this.#account.email = email;
        this.#account.loginToken = loginToken;
        this.#account.userId = userId;
        this.#gameCredentials.securityToken = sessionData.UserInfo.user[0].securityToken[0];
        this.#gameCredentials.userId = parseInt(sessionData.UserInfo.user[0].userId?.[0]) || 0;
        this.#authenticated = true;

        return session;
    }

    #gameHeaders() {
        return SBRW.gameHeaders(this.#gameCredentials.securityToken, this.#gameCredentials.userId);
    }

    async #gameGet(path) {
        const getReq = await request.get(`${this.#serverUrl}/${path}`, this.#gameHeaders());

        if (getReq.status == 401) this.#init();

        return getReq;
    }
    
    async #gamePostXml(path, xml) {
        const postReq = await request.post(`${this.#serverUrl}/${path}`, xml, this.#gameHeaders());

        if (postReq.status == 401) this.#init();

        return postReq;
    }
    
    async secureLoginPersona(personaId) {
        const loginPersona = await this.#gamePostXml(`User/SecureLoginPersona?userId=${this.#gameCredentials.userId}&personaId=${personaId}`, "");

        if (loginPersona.status < 300) this.#personas.activePersonaId = Number(personaId);

        return loginPersona;
    }

    async secureLogout() {
        const logout = await this.#gamePostXml(`User/SecureLogout?userId=${this.#gameCredentials.userId}&personaId=${this.#personas.activePersonaId}&exitCode=0`, "");

        if (logout.status < 300) this.#init();

        return logout;
    }
    
    async getCarslots(personaId) {
        return this.#gameGet(`personas/${personaId}/carslots?language=EN`);
    }

    async getCars(personaId) {
        return this.#gameGet(`personas/${personaId}/cars`);
    }

    async getDefaultCar(personaId) {
        return this.#gameGet(`personas/${personaId}/defaultcar`);
    }
    
    async getTreasureHunt() {
        return this.#gameGet("events/gettreasurehunteventsession");
    }
    
    async getFriendsList() {
        return this.#gameGet(`getfriendlistfromuserid?userId=${this.#gameCredentials.userId}`);
    }

    async getBlockedUsers() {
        return this.#gameGet(`getblockeduserlist?userId=${this.#gameCredentials.userId}`);
    }

    async getBlockersByUsers(personaId) {
        return this.#gameGet(`getblockersbyusers?personaId=${personaId}`);
    }

    async getUserSettings() {
        return this.#gameGet(`getusersettings?userId=${this.#gameCredentials.userId}`);
    }

    async getSocialSettings() {
        return this.#gameGet(`getsocialsettings`);
    }

    async getClientConfig() {
        return this.#gameGet("logging/client");
    }

    async getSystemInfo() {
        return this.#gameGet("systeminfo");
    }

    async getChatInfo() {
        return this.#gameGet("Session/GetChatInfo");
    }

    async getCarClasses() {
        return this.#gameGet("carclasses");
    }

    async getAvailableEventsAtLevel() {
        return this.#gameGet("events/availableatlevel");
    }

    async getExpLevelPointsMap() {
        return this.#gameGet("DriverPersona/GetExpLevelPointsMap");
    }

    async getFraudConfig() {
        return this.#gameGet("security/fraudConfig");
    }

    async getRebroadcasters() {
        return this.#gameGet("getrebroadcasters");
    }

    async getRegionInfo() {
        return this.#gameGet("getregioninfo");
    }

    async getLoginAnnouncements() {
        return this.#gameGet("LoginAnnouncements?language=EN");
    }
    
    async getAchievements() {
        return this.#gameGet("achievements/loadall");
    }
    
    async getPersonaPresence(driverName) {
        return this.#gameGet(`DriverPersona/GetPersonaPresenceByName?displayName=${driverName}`);
    }
    
    async getPersonaInfo(personaId) {
        return this.#gameGet(`DriverPersona/GetPersonaInfo?personaId=${personaId}`);
    }
    
    async getPersonaBaseInfo(personaId) {
        return this.#gamePostXml(
            "DriverPersona/GetPersonaBaseFromList",
            `<PersonaIdArray xmlns="http://schemas.datacontract.org/2004/07/Victory.TransferObjects.DriverPersona" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><PersonaIds xmlns:array="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><array:long>${personaId}</array:long></PersonaIds></PersonaIdArray>`
        );
    }
    
    async getInventory() {
        return this.#gameGet("personas/inventory/objects");
    }

    async sendHardwareInfo() {
        return this.#gamePostXml(
            "Reporting/SendHardwareInfo",
            `<HardwareInfo xmlns="http://schemas.datacontract.org/2004/07/Victory.DataLayer.Serialization" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><availableMem>4284018848</availableMem><cpuBrand>13th Gen Intel(R) Core(TM) i9-13900K</cpuBrand><cpuid0>GenuineIntel</cpuid0><cpuid1_0>0</cpuid1_0><cpuid1_1>0</cpuid1_1><cpuid1_2>0</cpuid1_2><cpuid1_3>0</cpuid1_3><deviceID>0</deviceID><excpuid1_0>0</excpuid1_0><excpuid1_1>0</excpuid1_1><excpuid1_2>0</excpuid1_2><excpuid1_3>0</excpuid1_3><gpuDescription/><gpuDriverBuild>0</gpuDriverBuild><gpuDriverSubversion>0</gpuDriverSubversion><gpuDriverVersion>0</gpuDriverVersion><gpuMemory>4227225472</gpuMemory><gpuProduct>0</gpuProduct><osBuildNumber>0</osBuildNumber><osMajorVersion>0</osMajorVersion><osMinorVersion>0</osMinorVersion><physicalCores>24</physicalCores><platformID>2</platformID><processAffinityMask>255</processAffinityMask><servicePack/><systemAffinityMask>1048575</systemAffinityMask><totalMemory>6981406208</totalMemory><userID>${this.#gameCredentials.userId}</userID><vendorID>0</vendorID></HardwareInfo>`
        );
    }

    async sendUserSettings() {
        return this.#gamePostXml(
            "Reporting/SendUserSettings",
            `<UserSettings xmlns="http://schemas.datacontract.org/2004/07/Victory.DataLayer.Serialization" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><desktopResHeight>1440</desktopResHeight><desktopResWidth>2560</desktopResWidth><fullscreen>false</fullscreen><gameResHeight>1440</gameResHeight><gameResWidth>2560</gameResWidth><globalDetailLevel>3</globalDetailLevel><userID>${this.#gameCredentials.userId}</userID></UserSettings>`
        );
    }
}

function generateRandomHwid() {
    const randomData = crypto.randomBytes(16).toString("hex");
    const hash = crypto.createHash("sha1").update(randomData).digest("hex").toUpperCase();

    return hash;
}

module.exports = SBRW;
