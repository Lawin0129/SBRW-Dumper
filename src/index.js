const config = require("../Config/config.json");
const ReadLine = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
});
ReadLine.setPrompt("");
ReadLine.pause();

const log = require("./utils/log");
const input = require("./utils/input");
const format = require("./utils/format");
const functions = require("./utils/functions");
const xmlParser = require("./utils/xmlParser");

const SBRW = require("./services/SBRW");
const UserExporter = require("./services/UserExporter");

const newLine = () => console.log("");
const authenticateUser = async (client, email, password) => {
    let session;

    try {
        session = await client.authenticateUser(email, password);
    } catch (err) {
        log.error("Auth", err);
        log.error("Auth", "Failed to login, please make sure you've set valid account details in config.json and select the correct server.");
        functions.exitProgram(5);
        return;
    }

    log.auth(`Logged in as "${email}"!`);
    log.auth("Successfully got Permanent Session!");

    return session;
};
const reAuthenticate = async (client, email, password) => {
    log.warn("This server most likely has protections in place to prevent third-party clients from interacting with it.");
    log.info("Achievements, Inventory and Treasure Hunt Info will have to be skipped as driver selection is not possible.");
    log.auth("Reauthenticating using details provided in config.json...");

    return authenticateUser(client, email, password);
};

let email = config.email;
let password = config.password;
let dumpSomeone = false;
let serverList;
let server;
let sbrwClient;
let userExporter;

const attemptReq = async (name, reqFunc, noReAuth) => {
    // Sometimes requests could fail because of specific security checks which indirectly affect this tool
    // If request fails, reauth and retry will be attempted for maxAttempts
    let req;
    let maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            req = await reqFunc();

            if (req.status >= 300) throw req;

            break;
        } catch (err) {
            if (attempt == maxAttempts) return log.error(name.replace(/ /ig, ""), err);

            log.warn(`Failed to get ${name}.`);
            log.info(`Attempting again...`);
            if (!noReAuth) {
                let newAuth = await reAuthenticate(sbrwClient, email, password);
                if (!newAuth) return;
            }
        }
    }

    return req;
};

(async () => {
    try {
        serverList = await SBRW.getServerList();
    } catch (err) {
        log.error("GetServerList", err);
        return;
    }
    
    let servers = format.makeIndexedListString(serverList.map(s => `${s.name} (${s.category})`));

    console.log(`Select a server:\n${servers}\n`);
    
    const optionNum = await input.askForNumber(ReadLine);
    server = serverList[optionNum];
    
    if (!server) {
        log.error("Select", "Not a valid option / server not found...");
        return functions.exitProgram(5);
    }
    
    sbrwClient = new SBRW(server.url);

    newLine();
    log.info(`Selected server "${server.name}".`);
    log.auth("Attempting to login using details provided in config.json...");
    
    // Authenticate User and Get Session
    let session = await authenticateUser(sbrwClient, email, password);
    if (!session) return;
    
    const options = [
        { name: "Export your own data." },
        { name: "Export someone else's data by their Driver Name." },
        { name: "Export someone else's data by their Persona ID." }
    ];
    
    let optionString = format.makeIndexedListString(options.map(opt => opt.name));

    console.log(`\nSelect an option:\n${optionString}\n`);
    
    const optNum = await input.askForNumber(ReadLine);

    switch (optNum) {
        case 0: {
            // Select driver
            if (sbrwClient.personas.list.length == 0) {
                newLine();
                log.error("Persona", "No personas found, please create a driver before you export your own data.");
                return functions.exitProgram(5);
            }

            let driverList = format.makeIndexedListString(sbrwClient.personas.list.map(val => `${val.name} (Persona ID: ${val.id})`));

            console.log(`\nSelect your driver:\n${driverList}\n`);

            const answerNum = await input.askForNumber(ReadLine);

            let driver = sbrwClient.personas.list[answerNum];

            if (!driver) {
                newLine();
                log.error("Persona", "Not a driver, try again later.");
                return functions.exitProgram(5);
            }

            userExporter = new UserExporter(server.name, { personaName: driver.name, personaId: driver.id });

            await userExporter.ensureDir();
            break;
        }

        case 1:
        case 2: {
            dumpSomeone = true;
            let personaId;

            if (optNum == 1) {
                const driverName = await input.askQuestion("\nEnter a Driver Name to dump: ", ReadLine);

                let driverSearch = await attemptReq("Driver Search", () => sbrwClient.getPersonaPresence(driverName));
                if (!driverSearch) {
                    log.error("Persona", "This driver does not exist, please enter a valid driver name next time.");
                    return;
                }

                let parsedSearch = await xmlParser.parseXML(driverSearch.data);
                personaId = parsedSearch.PersonaPresence.personaId[0];
            } else if (optNum == 2) {
                personaId = await input.askQuestion("\nEnter a Persona ID to dump: ", ReadLine);
            }

            let personaInfo = await attemptReq("Persona Info", () => sbrwClient.getPersonaInfo(personaId));
            if (!personaInfo) {
                log.error("PersonaInfo", "The Persona ID you entered does not exist, please enter a valid Persona ID next time.");
                return;
            }

            let parsedPersonaInfo = await xmlParser.parseXML(personaInfo.data);

            userExporter = new UserExporter(server.name, { personaName: parsedPersonaInfo.ProfileData.Name[0], personaId: personaId });

            await userExporter.ensureDir();

            newLine();
            log.success(`Driver ${userExporter.persona.name} (Persona ID: ${userExporter.persona.id}) will now be exported...`);
            break;
        }

        default: {
            log.error("Select", "Not a valid option...");
            return functions.exitProgram(5);
        }
    }

    await functions.sleep(500);
    
    if (!dumpSomeone) {
        // Login to specified driver
        let loginPersona;
        
        try {
            loginPersona = await sbrwClient.secureLoginPersona(userExporter.persona.id);
        } catch (err) {
            log.error("PersonaLogin", err);
            return;
        }

        newLine();
        
        if (loginPersona.status >= 300) {
            log.warn("Failed driver selection.");

            let newAuth = await reAuthenticate(sbrwClient, email, password);
            if (!newAuth) return;
        } else {
            log.success(`Logged in to driver!`);
        }

        await functions.sleep(1000);
    }

    log.info(`Starting to export driver ${userExporter.persona.name} (Persona ID: ${userExporter.persona.id})...`);
    
    // Dump owned cars
    let cars = await attemptReq("Owned Cars", () => sbrwClient[dumpSomeone ? "getCars" : "getCarslots"](userExporter.persona.id));
    if (!cars) return;
    
    // convert cars into carslots
    if (dumpSomeone) {
        let carsResults = await xmlParser.parseXML(cars.data);
        
        let defaultCar;
        let defaultCarResults;
        
        let carslotsTemplate = {
            CarSlotInfoTrans: {
                CarsOwnedByPersona: [{ OwnedCarTrans: [] }],
                DefaultOwnedCarIndex: ["0"],
                ObtainableSlots: [""],
                OwnedCarSlotsCount: ["350"]
            }
        };
        
        try {
            defaultCar = await sbrwClient.getDefaultCar(userExporter.persona.id);
        } catch {}
        
        if (defaultCar?.status == 200) defaultCarResults = await xmlParser.parseXML(defaultCar.data);
        else {
            log.warn("Failed to get Default Car. Default Owned Car Index will be set to 0.");
        }
        
        if (defaultCarResults) {
            let carIndex = carsResults.ArrayOfOwnedCarTrans.OwnedCarTrans.findIndex(i => JSON.stringify(i) == JSON.stringify(defaultCarResults.OwnedCarTrans));
            
            if (carIndex != -1) {
                carslotsTemplate.CarSlotInfoTrans.DefaultOwnedCarIndex = [`${carIndex}`];
            }
        }
        
        carslotsTemplate.CarSlotInfoTrans.CarsOwnedByPersona[0].OwnedCarTrans = carsResults.ArrayOfOwnedCarTrans.OwnedCarTrans;
        
        await userExporter.saveCarslots(xmlParser.buildXML(carslotsTemplate));
    } else {
        await userExporter.saveCarslots(cars.data);
    }
    
    log.success("Owned Cars exported! (carslots.xml)");
    
    await functions.sleep(500);

    // Dump driver info
    let personaInfo = await attemptReq("Persona Info", () => sbrwClient.getPersonaInfo(userExporter.persona.id));
    if (!personaInfo) return;

    await userExporter.savePersonaInfo(personaInfo.data);
    log.success("Driver Info exported! (GetPersonaInfo.xml)");

    await functions.sleep(500);

    // Dump driver base info
    let personaBaseInfo = await attemptReq("Persona Base", () => sbrwClient.getPersonaBaseInfo(userExporter.persona.id));
    if (!personaBaseInfo) return;

    await userExporter.savePersonaBaseInfo(personaBaseInfo.data);
    log.success("Driver Base Info exported! (GetPersonaBase.xml)");

    await functions.sleep(500);
    
    if (!dumpSomeone && (sbrwClient.personas.activePersonaId == userExporter.persona.id)) {
        // Dump achievements
        let achievements = await attemptReq("Achievements", () => sbrwClient.getAchievements(), true);
        if (!achievements) return;

        await userExporter.saveAchievements(achievements.data);
        log.success("Achievements exported! (loadall.xml)");

        await functions.sleep(500);

        // Dump inventory
        let inventory = await attemptReq("Inventory", () => sbrwClient.getInventory(), true);
        if (!inventory) return;

        await userExporter.saveInventory(inventory.data);
        log.success("Inventory exported! (objects.xml)");

        await functions.sleep(500);
        
        // Dump treasure hunt info
        let treasureHunt = await attemptReq("Treasure Hunt", () => sbrwClient.getTreasureHunt(), true);
        if (!treasureHunt) return;
        
        await userExporter.saveTreasureHunt(treasureHunt.data);
        log.success("Treasure Hunt Info exported! (gettreasurehunteventsession.xml)");
        
        await functions.sleep(500);
    }

    if (!dumpSomeone) {
        // Dump friends list
        let friendsList = await attemptReq("Friends List", () => sbrwClient.getFriendsList());
        if (!friendsList) return;

        await userExporter.saveFriendsList(friendsList.data);
        log.success("Friends List exported! (getfriendlistfromuserid.xml)");
    }
    
    await functions.sleep(500);
    
    // Log out
    let logout = await attemptReq("Log Out", () => sbrwClient.secureLogout(), true);
    if (!logout) return;
    
    log.auth(`Logged out of "${email}".`);
})();
