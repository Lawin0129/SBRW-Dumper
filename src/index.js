const config = require("../Config/config.json");
const ReadLine = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
});

const functions = require("./utils/functions");
const xmlParser = require("./utils/xmlParser");

const SBRW = require("./services/SBRW");
const UserExporter = require("./services/UserExporter");

ReadLine.question("Would you like to dump your SBRW data? (y/n)\n", async (Answer) => {
    let dumpSomeone = false;
    let personaId;
    let server;
    let sbrwClient;
    let userExporter;

    if (Answer.toLowerCase() == "yes" || Answer.toLowerCase() == "y") {
        let serverList;

        try {
            serverList = await SBRW.getServerList();
        } catch (err) {
            functions.logError(err);
            return;
        }

        if (serverList.status >= 300) return functions.logError(serverList);

        const options = [
            { name: "Dump your own data", index: 0 },
            { name: "Dump someone elses data by their driver name", index: 1 },
            { name: "Dump someone elses data by their personaId", index: 2 }
        ];

        let optionString = "";
        options.forEach(a => optionString += ` [${a.index}] ${a.name}\n`);

        const option = await functions.askQuestion(`\nSelect an option:\n${optionString}`, ReadLine);
        
        if (!options.find(x => x.index == Number(option))) {
            console.log("ERROR: Not a valid option...\nClosing in 5 seconds...");
            await functions.sleep(5000);
            process.exit(0);
        }

        let servers = "";
        serverList.forEach((s, idx) => servers += ` [${idx}] ${s.name} (${s.category})\n`);
    
        const ans = await functions.askQuestion(`\nSelect a server:\n${servers}`, ReadLine);
    
        if (serverList[ans]) server = serverList[ans];
        if (serverList.find(i => i.name == ans)) server = serverList.find(i => i.name == ans);

        if (Number(option) == 1 || Number(option) == 2) dumpSomeone = true;

        if (!server) {
            console.log("ERROR: Not a valid option / server not found...\nClosing in 5 seconds...");
            await functions.sleep(5000);
            process.exit(0);
        }

        sbrwClient = new SBRW(server.url);

        await functions.sleep(1000);

        // Authenticate User and Get Session
        let session;
        
        try {
            session = await sbrwClient.authenticateUser(config.email, config.password);
        } catch (err) {
            functions.logError(err);
            return;
        }

        if (session.status >= 300) return functions.logError(session);

        console.log(`\nLogged in as ${config.email}\n`);
        console.log("Successfully got Permanent Session!");

        let sessionData = await xmlParser.parseXML(session.data);

        // Select driver
        if (!dumpSomeone) {
            if (!sessionData.UserInfo.personas[0].ProfileData) {
                console.log("\nERROR: This account is new, please set the driver up before you use this program.\nClosing in 5 seconds...");
                await functions.sleep(5000);
                process.exit(0);
            }

            let drivers = [];

            for (let i in sessionData.UserInfo.personas[0].ProfileData) {
                let driver = sessionData.UserInfo.personas[0].ProfileData[i];
                drivers.push({ personaId: driver.PersonaId[0], name: driver.Name[0], index: Number(i) })
            }

            let driverList = "";
            drivers.forEach(val => driverList += ` [${val.index}] ${val.name} (personaId: ${val.personaId})\n`);

            const answer = await functions.askQuestion(`\nSelect your driver:\n${driverList}`, ReadLine);

            let driver;

            if (drivers.find(x => x.personaId == Number(answer))) driver = drivers.find(x => x.personaId == Number(answer));
            if (drivers.find(x => x.name.toLowerCase() == answer.toLowerCase())) driver = drivers.find(x => x.name.toLowerCase() == answer.toLowerCase());
            if (drivers.find(x => x.index == Number(answer))) driver = drivers.find(x => x.index == Number(answer));

            if (driver) personaId = driver.personaId;
            else {
                console.log("\nERROR: Not a driver, try again later.\nClosing in 5 seconds...");
                await functions.sleep(5000);
                process.exit(0);
            }

            userExporter = new UserExporter(server.name, { personaName: driver.name, personaId: personaId });

            await userExporter.ensureDir();
        } else if (Number(option) == 1) {
            const driverName = await functions.askQuestion("\nEnter a driver name to dump: ", ReadLine);
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

            let personaInfo;

            try {
                personaInfo = await sbrwClient.getPersonaInfo(personaId);
            } catch (err) {
                functions.logError(err);
                return;
            }

            if (personaInfo.status >= 300) return functions.logError(personaInfo);

            let parsedPersonaInfo = await xmlParser.parseXML(personaInfo.data);

            userExporter = new UserExporter(server.name, { personaName: parsedPersonaInfo.ProfileData.Name[0], personaId: personaId });

            await userExporter.ensureDir();

            console.log(`\nDriver ${userExporter.persona.name} (personaId: ${userExporter.persona.id}) will now be dumped...\n`);
        } else if (Number(option) == 2) {
            const persona = await functions.askQuestion("\nEnter a personaId to dump: ", ReadLine);

            let personaInfo;

            try {
                personaInfo = await sbrwClient.getPersonaInfo(persona);
            } catch (err) {
                functions.logError(err);
                return;
            }
            
            if (personaInfo.status >= 300) {
                functions.logError(personaInfo);
                console.log("The personaId you entered does not exist, please enter a valid personaId next time.");
                return;
            }

            let personaResults = await xmlParser.parseXML(personaInfo.data);
            personaId = personaResults.ProfileData.PersonaId[0];

            userExporter = new UserExporter(server.name, { personaName: personaResults.ProfileData.Name[0], personaId: personaId });

            await userExporter.ensureDir();

            console.log(`\nDriver ${userExporter.persona.name} (personaId: ${userExporter.persona.id}) will now be dumped...\n`);
        }

        if (!dumpSomeone) {
            await functions.sleep(1000);

            // Login to specified driver
            let loginPersona;

            try {
                loginPersona = await sbrwClient.secureLoginPersona(personaId);
            } catch (err) {
                functions.logError(err);
                return;
            }

            if (loginPersona.status >= 300) return functions.logError(loginPersona);

            console.log("\nSuccessfully logged in to driver!");
        }

        await functions.sleep(1000);

        // Dump owned cars
        let cars;

        try {
            cars = await sbrwClient.getCarslots(personaId, { dumpSomeone });
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
            }

            try {
                defaultCar = await sbrwClient.getDefaultCar(personaId);
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

        await functions.sleep(1000);

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

            await functions.sleep(1000);

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

            await functions.sleep(1000);

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

            await functions.sleep(1000);

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
        
            await functions.sleep(1000);
        }

        // Dump driver info
        let personaInfo;
        
        try {
            personaInfo = await sbrwClient.getPersonaInfo(personaId);
        } catch (err) {
            functions.logError(err);
            return;
        }

        if (personaInfo.status >= 300) return functions.logError(personaInfo);

        await userExporter.savePersonaInfo(personaInfo.data);
        console.log("Driver Info successfully dumped! (GetPersonaInfo.xml)");

        await functions.sleep(1000);

        // Dump driver base info
        let personaBaseInfo;

        try {
            personaBaseInfo = await sbrwClient.getPersonaBaseInfo(personaId);
        } catch (err) {
            functions.logError(err);
            return;
        }

        if (personaBaseInfo.status >= 300) return functions.logError(personaBaseInfo);

        await userExporter.savePersonaBaseInfo(personaBaseInfo.data);
        console.log("Driver Base Info successfully dumped! (GetPersonaBase.xml)");

        await functions.sleep(1000);

        if (!dumpSomeone) {
            // Log out
            let logout;
            
            try {
                logout = await sbrwClient.secureLogout(personaId);
            } catch (err) {
                functions.logError(err);
                return;
            }

            if (logout.status >= 300) return functions.logError(logout);
        }

        console.log(`\nLogged out of ${config.email}`);

    } else {
        console.log("Okay, have a good day.");
        await functions.sleep(2000);
        process.exit(0);
    }
});
