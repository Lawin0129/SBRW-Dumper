const config = require("../Config/config.json");
const ReadLine = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
});

const input = require("./utils/input");
const functions = require("./utils/functions");
const xmlParser = require("./utils/xmlParser");

const SBRW = require("./services/SBRW");
const UserExporter = require("./services/UserExporter");

let dumpSomeone = false;
let serverList;
let server;
let sbrwClient;
let userExporter;

(async () => {
    try {
        serverList = await SBRW.getServerList();
    } catch (err) {
        functions.logError(err);
        return;
    }
    
    let servers = "";
    serverList.forEach((s, idx) => servers += ` [${idx}] ${s.name} (${s.category})\n`);

    console.log(`Select a server:\n${servers}`);
    
    const optionNum = await input.askForNumber(ReadLine);
    server = serverList[optionNum];
    
    if (!server) {
        console.log("ERROR: Not a valid option / server not found...\nClosing in 5 seconds...");
        await functions.sleep(5000);
        process.exit(0);
    }
    
    sbrwClient = new SBRW(server.url);

    console.log("\nAttempting to login using details provided in config.json...");
    
    await functions.sleep(500);
    
    // Authenticate User and Get Session
    let session;
    
    try {
        session = await sbrwClient.authenticateUser(config.email, config.password);
    } catch (err) {
        functions.logError(err);
        return;
    }
    
    console.log(`\nLogged in as "${config.email}"!`);
    console.log("Successfully got Permanent Session!");
    
    const options = [
        { name: "Export your own data." },
        { name: "Export someone else's data by their Driver Name." },
        { name: "Export someone else's data by their Persona ID." }
    ];
    
    let optionString = "";
    options.forEach((opt, idx) => optionString += ` [${idx}] ${opt.name}\n`);

    console.log(`\nSelect an option:\n${optionString}`);
    
    const optNum = await input.askForNumber(ReadLine);
    
    if (!options[optNum]) {
        console.log("ERROR: Not a valid option...\nClosing in 5 seconds...");
        await functions.sleep(5000);
        process.exit(0);
    }

    switch (optNum) {
        case 0: {
            // Select driver
            if (sbrwClient.personas.length == 0) {
                console.log("\nERROR: No personas found, please create a driver before you use this program.\nClosing in 5 seconds...");
                await functions.sleep(5000);
                process.exit(0);
            }

            let driverList = "";
            sbrwClient.personas.forEach((val, idx) => driverList += ` [${idx}] ${val.name} (Persona ID: ${val.personaId})\n`);

            console.log(`\nSelect your driver:\n${driverList}`);

            const answerNum = await input.askForNumber(ReadLine);

            let driver = sbrwClient.personas[answerNum];

            if (!driver) {
                console.log("\nERROR: Not a driver, try again later.\nClosing in 5 seconds...");
                await functions.sleep(5000);
                process.exit(0);
            }

            userExporter = new UserExporter(server.name, { personaName: driver.name, personaId: driver.personaId });

            await userExporter.ensureDir();
            break;
        }

        case 1:
        case 2: {
            dumpSomeone = true;
            let personaId;

            if (optNum == 1) {
                const driverName = await input.askQuestion("\nEnter a driver name to dump: ", ReadLine);
                let driverSearch;

                try {
                    driverSearch = await sbrwClient.getPersonaPresence(driverName);
                } catch (err) {
                    functions.logError(err);
                    return;
                }

                if (driverSearch.status >= 300) {
                    functions.logError(driverSearch);
                    console.log("This driver does not exist, please enter a valid driver name next time.");
                    return;
                }

                let parsedSearch = await xmlParser.parseXML(driverSearch.data);
                personaId = parsedSearch.PersonaPresence.personaId[0];
            } else if (optNum == 2) {
                personaId = await input.askQuestion("\nEnter a Persona ID to dump: ", ReadLine);
            }

            let personaInfo;

            try {
                personaInfo = await sbrwClient.getPersonaInfo(personaId);
            } catch (err) {
                functions.logError(err);
                return;
            }

            if (personaInfo.status >= 300) {
                functions.logError(personaInfo);
                console.log("The Persona ID you entered does not exist, please enter a valid Persona ID next time.");
                return;
            }

            let parsedPersonaInfo = await xmlParser.parseXML(personaInfo.data);

            userExporter = new UserExporter(server.name, { personaName: parsedPersonaInfo.ProfileData.Name[0], personaId: personaId });

            await userExporter.ensureDir();

            console.log(`\nDriver ${userExporter.persona.name} (Persona ID: ${userExporter.persona.id}) will now be dumped...\n`);
            break;
        }
    }

    await functions.sleep(500);
    
    if (!dumpSomeone) {
        // Login to specified driver
        let loginPersona;
        
        try {
            loginPersona = await sbrwClient.secureLoginPersona(userExporter.persona.id);
        } catch (err) {
            functions.logError(err);
            return;
        }
        
        if (loginPersona.status >= 300) return functions.logError(loginPersona);

        console.log("\nSuccessfully logged in to driver!");
    }
    
    // Dump owned cars
    let cars;
    
    try {
        cars = await sbrwClient.getCarslots(userExporter.persona.id, { dumpSomeone });
    } catch (err) {
        functions.logError(err);
        return;
    }
    
    if (cars.status >= 300) return functions.logError(cars);
    
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
    
    console.log("Car slots successfully dumped! (carslots.xml)");
    
    await functions.sleep(500);
    
    if (!dumpSomeone) {
        // Dump treasure hunt info
        let treasureHunt;
        
        try {
            treasureHunt = await sbrwClient.getTreasureHunt();
        } catch (err) {
            functions.logError(err);
            return;
        }
        
        if (treasureHunt.status >= 300) return functions.logError(treasureHunt);
        
        await userExporter.saveTreasureHunt(treasureHunt.data);
        console.log("TreasureHuntSession successfully dumped! (gettreasurehunteventsession.xml)");
        
        await functions.sleep(500);
        
        // Dump friends list
        let friendsList;
        
        try {
            friendsList = await sbrwClient.getFriendsList();
        } catch (err) {
            functions.logError(err);
            return;
        }
        
        if (friendsList.status >= 300) return functions.logError(friendsList);
        
        await userExporter.saveFriendsList(friendsList.data);
        console.log("FriendsList successfully dumped! (getfriendlistfromuserid.xml)");
        
        await functions.sleep(500);
        
        // Dump achievements
        let achievements;
        
        try {
            achievements = await sbrwClient.getAchievements();
        } catch (err) {
            functions.logError(err);
            return;
        }
        
        if (achievements.status >= 300) return functions.logError(achievements);
        
        await userExporter.saveAchievements(achievements.data);
        console.log("Achievements successfully dumped! (loadall.xml)");
        
        await functions.sleep(500);
        
        // Dump inventory
        let inventory;
        
        try {
            inventory = await sbrwClient.getInventory();
        } catch (err) {
            functions.logError(err);
            return;
        }
        
        if (inventory.status >= 300) return functions.logError(inventory);
        
        await userExporter.saveInventory(inventory.data);
        console.log("Inventory successfully dumped! (objects.xml)");
        
        await functions.sleep(500);
    }
    
    // Dump driver info
    let personaInfo;
    
    try {
        personaInfo = await sbrwClient.getPersonaInfo(userExporter.persona.id);
    } catch (err) {
        functions.logError(err);
        return;
    }
    
    if (personaInfo.status >= 300) return functions.logError(personaInfo);
    
    await userExporter.savePersonaInfo(personaInfo.data);
    console.log("Driver Info successfully dumped! (GetPersonaInfo.xml)");
    
    await functions.sleep(500);
    
    // Dump driver base info
    let personaBaseInfo;
    
    try {
        personaBaseInfo = await sbrwClient.getPersonaBaseInfo(userExporter.persona.id);
    } catch (err) {
        functions.logError(err);
        return;
    }
    
    if (personaBaseInfo.status >= 300) return functions.logError(personaBaseInfo);
    
    await userExporter.savePersonaBaseInfo(personaBaseInfo.data);
    console.log("Driver Base Info successfully dumped! (GetPersonaBase.xml)");
    
    await functions.sleep(500);
    
    // Log out
    let logout;
    
    try {
        logout = await sbrwClient.secureLogout(dumpSomeone ? 0 : userExporter.persona.id);
    } catch (err) {
        functions.logError(err);
        return;
    }
    
    if (logout.status >= 300) return functions.logError(logout);
    
    console.log(`\nLogged out of "${config.email}".`);
})();
