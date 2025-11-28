const request = require("../../src/utils/request");
const crypto = require("crypto");
const xml2js = require("xml2js");
const XML2JS = new xml2js.Parser();

let SbrwServer;
let AuthToken;
let UserID;

let sbrwHeaders = {
    "Cache-Control": "no-store,no-cache",
    "Pragma": "no-cache",
    "User-Agent": "SBRW Launcher 2.2.4 (+https://github.com/SoapBoxRaceWorld/GameLauncher_NFSW)",
    "Connection": "Close"
};

const sbrwAuthenticationHeaders = {
    "Cache-Control": "no-store,no-cache",
    "Pragma": "no-cache",
    "User-Agent": "SBRW Launcher 2.2.4 (+https://github.com/SoapBoxRaceWorld/GameLauncher_NFSW)",
    "X-UserAgent": "GameLauncherReborn 2.2.4 WinForms (+https://github.com/SoapBoxRaceWorld/GameLauncher_NFSW)",
    "X-GameLauncherHash": "9F89E2ABABEC7F8D78C97A646FB8D46894CE96F9",
    "X-GameLauncherCertificate": "0000000000000000",
    "X-HWID": generateRandomHwid(),
    "X-HiddenHWID": generateRandomHwid()
};

const gameHeaders = (LoginToken, userId) => ({
    "securityToken": LoginToken,
    "userId": userId,
    "Accept-Encoding": "gzip,deflate",
    "User-Agent": "EA/2.0 (compatible)",
    "Content-Type": "text/xml; charset=utf-8"
});

function generateRandomHwid() {
    const randomData = crypto.randomBytes(16).toString("hex");
    const hash = crypto.createHash("sha1").update(randomData).digest("hex").toUpperCase();

    return hash;
}

async function GetServerList() {
    const serverList = await request.get("https://api.worldunited.gg/serverlist.json", sbrwHeaders);
    
    let servers = serverList.data
        .filter(s => s.category == "SBRW")
        .map(s => ({
            id: s.id,
            name: s.name,
            url: s.ip_address
        }));
    
    return servers;
}

async function GetServerInformation(server) {
    const serverInfo = await request.get(`${server}/GetServerInformation`, sbrwHeaders);

    return serverInfo;
}

async function authenticateUser(email, password, server) {
    SbrwServer = server;

    let userId;
    let LoginToken;
    let modernAuth = false;

    const serverInfo = await GetServerInformation(SbrwServer);
    modernAuth = serverInfo.data.modernAuthSupport || false;

    // authenticate user
    if (!modernAuth) {
        const auth = await request.get(`${SbrwServer}/User/authenticateUser?email=${email}&password=${crypto.createHash("sha1").update(password).digest("hex")}`, sbrwAuthenticationHeaders);

        let authData;

        XML2JS.parseString(auth.data, (err, result) => authData = result);

        userId = authData.LoginStatusVO.UserId[0];
        LoginToken = authData.LoginStatusVO.LoginToken[0];
    } else {
        const newAuth = await request.post(`${SbrwServer}/User/modernAuth`, { email: email, password: password, upgrade: true }, sbrwAuthenticationHeaders);

        userId = newAuth.data.userId;
        LoginToken = newAuth.data.token;
    }

    // get session when authenticated
    console.log(`\nLogged in as ${email}\n`);
    
    const session = await request
        .post(`${SbrwServer}/User/GetPermanentSession`,
              '<GetPermanentSessionData xmlns="http://schemas.datacontract.org/2004/07/Victory.DataLayer.Serialization" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><machineID>000000000000000000</machineID><version>637</version></GetPermanentSessionData>',
               gameHeaders(LoginToken, userId));
        
    console.log("Successfully got Permanent Session!");
    
    let sessionData;
    
    XML2JS.parseString(session.data, (err, result) => sessionData = result);
    
    AuthToken = sessionData.UserInfo.user[0].securityToken[0];
    UserID = userId;
    
    return session;
}

async function SecureLogout(personaId) {
    const Logout = await request.post(`${SbrwServer}/User/SecureLogout?userId=${UserID}&personaId=${personaId}&exitCode=0`, '', gameHeaders(AuthToken, UserID));
    
    if (Logout.status == 200) return Logout;
}

async function SecureLoginPersona(personaId) {
    const loginPersona = await request.post(`${SbrwServer}/User/SecureLoginPersona?userId=${UserID}&personaId=${personaId}`, '', gameHeaders(AuthToken, UserID));
    
    if (loginPersona.status == 200) return loginPersona;
}

async function DefaultCar(personaId) {
    const defaultCar = await request.get(`${SbrwServer}/personas/${personaId}/defaultcar`, gameHeaders(AuthToken, UserID));

    if (defaultCar.status == 200) return defaultCar;
}

async function CarSlots(personaId, options) {
    let cars = "carslots";

    if (options) {
        if (options.dumpSomeone) cars = "cars";
    }

    const Carslots = await request.get(`${SbrwServer}/personas/${personaId}/${cars}?language=EN`, gameHeaders(AuthToken, UserID));

    if (Carslots.status == 200) return Carslots;
}

async function GetTreasureHunt() {
    const TreasureHunt = await request.get(`${SbrwServer}/events/gettreasurehunteventsession`, gameHeaders(AuthToken, UserID));

    if (TreasureHunt.status == 200) return TreasureHunt;
}

async function GetFriendsList() {
    const FriendsList = await request.get(`${SbrwServer}/getfriendlistfromuserid?userId=${UserID}`, gameHeaders(AuthToken, UserID));

    if (FriendsList.status == 200) return FriendsList;
}

async function GetAchievements() {
    const Achievements = await request.get(`${SbrwServer}/achievements/loadall`, gameHeaders(AuthToken, UserID));

    if (Achievements.status == 200) return Achievements;
}

async function GetPersonaPresence(driverName) {
    const PersonaPresence = await request.get(`${SbrwServer}/DriverPersona/GetPersonaPresenceByName?displayName=${driverName}`, gameHeaders(AuthToken, UserID));

    if (PersonaPresence.status == 200) return PersonaPresence;
}

async function GetPersonaInfo(personaId) {
    const PersonaInfo = await request.get(`${SbrwServer}/DriverPersona/GetPersonaInfo?personaId=${personaId}`, gameHeaders(AuthToken, UserID));

    if (PersonaInfo.status == 200) return PersonaInfo;
}

async function GetPersonaBase(personaId) {
    const PersonaBase = await request
        .post(`${SbrwServer}/DriverPersona/GetPersonaBaseFromList`,
              `<PersonaIdArray xmlns="http://schemas.datacontract.org/2004/07/Victory.TransferObjects.DriverPersona" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><PersonaIds xmlns:array="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><array:long>${personaId}</array:long></PersonaIds></PersonaIdArray>`,
              gameHeaders(AuthToken, UserID));

    if (PersonaBase.status == 200) return PersonaBase;
}

async function GetInventory() {
    const Inventory = await request.get(`${SbrwServer}/personas/inventory/objects`, gameHeaders(AuthToken, UserID));

    if (Inventory.status == 200) return Inventory;
}

module.exports = {
    GetServerList,
    GetServerInformation,
    authenticateUser,
    SecureLogout,
    SecureLoginPersona,
    DefaultCar,
    CarSlots,
    GetTreasureHunt,
    GetFriendsList,
    GetAchievements,
    GetPersonaPresence,
    GetPersonaInfo,
    GetPersonaBase,
    GetInventory
}
