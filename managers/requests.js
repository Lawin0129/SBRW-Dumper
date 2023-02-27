const { default: axios } = require("axios");
const crypto = require("crypto");
const xml2js = require("xml2js");
const XML2JS = new xml2js.Parser();

let sbrwServer;
let authToken;
let userNum;

const gameHeaders = (LoginToken, userId) => {
    return { 
        headers: {
            "securityToken": LoginToken,
            "userId": userId,
            "Accept-Encoding": "gzip,deflate",
            "User-Agent": "EA/2.0 (compatible)",
            "Content-Type": "text/xml; charset=utf-8",
        }
    }
}

async function GetServerList() {
    let err;
    const serverList = await axios.get("https://api.worldunited.gg/serverlist.json").catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;

    if (serverList.status == 200) {
        let servers = [];

        for (var i in serverList.data) {
            if (serverList.data[i].category == "SBRW") {
                servers.push({ id: serverList.data[i].id, name: serverList.data[i].name, url: serverList.data[i].ip_address, index: Number(i) });
            }
        }

        return { data: servers, status: serverList.status };
    }
}

async function GetServerInformation(server) {
    let err;
    const serverInfo = await axios.get(`${server}/GetServerInformation`).catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;

    if (serverInfo.status == 200) return { data: serverInfo.data, status: serverInfo.status };
}

async function authenticateUser(email, password, server) {
    sbrwServer = server;

    let userId;
    let LoginToken;
    let modernAuth = false;

    const serverInfo = await GetServerInformation(sbrwServer);
    modernAuth = serverInfo.data.modernAuthSupport || false;

    // authenticate user
    if (!modernAuth) {
        let err;
        const auth = await axios
            .get(`${sbrwServer}/User/authenticateUser?email=${email}&password=${crypto.createHash("sha1").update(password).digest("hex")}`, {
                headers: {
                    "User-Agent": "SBRW Launcher 2.2.0.4 (+https://github.com/SoapBoxRaceWorld/GameLauncher_NFSW)",
                    "X-UserAgent": "GameLauncherReborn 2.2.0.4 WinForms (+https://github.com/SoapBoxRaceWorld/GameLauncher_NFSW)",
                    "X-GameLauncherHash": "0",
                    "X-GameLauncherCertificate": "0",
                    "X-HWID": "",
                    "X-HiddenHWID": ""
                }}).catch(error => err = { data: error.response.data, status: error.response.status });
        if (err) return { error: err.data, status: err.status, solution: "Did you enter the correct login details in the file config.json?" };

        let authData;

        XML2JS.parseString(auth.data, (err, result) => authData = result);

        userId = authData.LoginStatusVO.UserId[0];
        LoginToken = authData.LoginStatusVO.LoginToken[0];
    } else {
        let err;
        const newAuth = await axios
            .post(`${sbrwServer}/User/modernAuth`, { email: email, password: password, upgrade: true }, {
                headers: {
                    "User-Agent": "SBRW Launcher 2.2.0.4 (+https://github.com/SoapBoxRaceWorld/GameLauncher_NFSW)",
                    "X-UserAgent": "GameLauncherReborn 2.2.0.4 WinForms (+https://github.com/SoapBoxRaceWorld/GameLauncher_NFSW)",
                    "X-GameLauncherHash": "0",
                    "X-GameLauncherCertificate": "0",
                    "X-HWID": "",
                    "X-HiddenHWID": ""
                }}).catch(error => err = { data: error.response.data, status: error.response.status });
        if (err) return { error: err.data, status: err.status, solution: "Did you enter the correct login details in the file config.json?" };

        userId = newAuth.data.userId;
        LoginToken = newAuth.data.token;
    }

    // get session if authenticated
    if (LoginToken) {
        console.log(`\nLogged in as ${email}\n`);

        let err;
        const session = await axios
            .post(`${sbrwServer}/User/GetPermanentSession`,
            '<GetPermanentSessionData xmlns="http://schemas.datacontract.org/2004/07/Victory.DataLayer.Serialization" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><machineID>000000000000000000</machineID><version>637</version></GetPermanentSessionData>',
            gameHeaders(LoginToken, userId)).catch(error => err = { data: error.response.data, status: error.response.status });
        let sessionData;
        if (err) return { error: err.data, status: err.status, solution: "Unknown" };
        
        if (session.status == 200) {
            console.log("Successfully got Permanent Session!");

            XML2JS.parseString(session.data, (err, result) => sessionData = result);

            authToken = sessionData.UserInfo.user[0].securityToken[0];
            userNum = userId;

            return { data: session.data, status: session.status };
        }
    }
}

async function SecureLogout(personaId) {
    let err;
    const Logout = await axios
        .post(`${sbrwServer}/User/SecureLogout?userId=${userNum}&personaId=${personaId}&exitCode=0`, '',
        gameHeaders(authToken, userNum)).catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;
    
    if (Logout.status == 200) return { data: Logout.data, status: Logout.status };
}

async function SecureLoginPersona(personaId) {
    let err;
    const loginPersona = await axios
        .post(`${sbrwServer}/User/SecureLoginPersona?userId=${userNum}&personaId=${personaId}`, '',
        gameHeaders(authToken, userNum)).catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;
    
    if (loginPersona.status == 200) return { data: loginPersona.data, status: loginPersona.status };
}

async function DefaultCar(personaId) {
    let err;
    const Car = await axios
        .get(`${sbrwServer}/personas/${personaId}/defaultcar`,
        gameHeaders(authToken, userNum)).catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;

    if (Car.status == 200) return { data: Car.data, status: Car.status };
}

async function CarSlots(personaId, options) {
    let cars = "carslots";

    if (options) {
        if (options.dumpSomeone) cars = "cars";
    }

    let err;
    const CarSlot = await axios
        .get(`${sbrwServer}/personas/${personaId}/${cars}?language=EN`,
        gameHeaders(authToken, userNum)).catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;

    if (CarSlot.status == 200) return { data: CarSlot.data, status: CarSlot.status };
}

async function GetTreasureHunt() {
    let err;
    const TreasureHunt = await axios
        .get(`${sbrwServer}/events/gettreasurehunteventsession`,
        gameHeaders(authToken, userNum)).catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;

    if (TreasureHunt.status == 200) return { data: TreasureHunt.data, status: TreasureHunt.status };
}

async function GetFriendsList() {
    let err;
    const FriendsList = await axios
        .get(`${sbrwServer}/getfriendlistfromuserid?userId=${userNum}`,
        gameHeaders(authToken, userNum)).catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;

    if (FriendsList.status == 200) return { data: FriendsList.data, status: FriendsList.status };
}

async function GetAchievements() {
    let err;
    const Achievements = await axios
        .get(`${sbrwServer}/achievements/loadall`,
        gameHeaders(authToken, userNum)).catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;

    if (Achievements.status == 200) return { data: Achievements.data, status: Achievements.status };
}

async function GetPersonaPresence(driverName) {
    let err;
    const PersonaInfo = await axios
        .get(`${sbrwServer}/DriverPersona/GetPersonaPresenceByName?displayName=${driverName}`,
        gameHeaders(authToken, userNum)).catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;

    if (PersonaInfo.status == 200) return { data: PersonaInfo.data, status: PersonaInfo.status };
}

async function GetPersonaInfo(personaId) {
    let err;
    const PersonaInfo = await axios
        .get(`${sbrwServer}/DriverPersona/GetPersonaInfo?personaId=${personaId}`,
        gameHeaders(authToken, userNum)).catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;

    if (PersonaInfo.status == 200) return { data: PersonaInfo.data, status: PersonaInfo.status };
}

async function GetPersonaBase(personaId) {
    let err;
    const PersonaBase = await axios
        .post(`${sbrwServer}/DriverPersona/GetPersonaBaseFromList`,
        `<PersonaIdArray xmlns="http://schemas.datacontract.org/2004/07/Victory.TransferObjects.DriverPersona" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><PersonaIds xmlns:array="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><array:long>${personaId}</array:long></PersonaIds></PersonaIdArray>`,
        gameHeaders(authToken, userNum)).catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;

    if (PersonaBase.status == 200) return { data: PersonaBase.data, status: PersonaBase.status };
}

async function GetInventory() {
    let err;
    const Inventory = await axios
        .get(`${sbrwServer}/personas/inventory/objects`,
        gameHeaders(authToken, userNum)).catch(error => err = { data: error.response.data, status: error.response.status });
    if (err) return err;

    if (Inventory.status == 200) return { data: Inventory.data, status: Inventory.status };
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