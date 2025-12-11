const config = require("../Config/config.json");
const fs = require("fs");
const path = require("path");
const ReadLine = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
});

const xmlParser = require("./utils/xmlParser");
const SBRW = require("./services/sbrw");

ReadLine.question("Would you like to dump your SBRW data? (y/n)\n", async (Answer) => {
    let dumpSomeone = false;
    let personaId;
    let server;
    let sbrwClient;
    let newDate = (new Date().toISOString()).replace(/:/ig, "-").replace("T", " ").replace("Z", "").split(".")[0]
    let dumpFolder = path.join(__dirname, "..", "Dumped");

    if (Answer.toLowerCase() == "yes" || Answer.toLowerCase() == "y") {
        if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

        let serverList;

        try {
            serverList = await SBRW.getServerList();
        } catch (err) {
            logError(err);
            return;
        }

        if (serverList.status >= 300) return logError(serverList);

        const options = [
            { name: "Dump your own data", index: 0 },
            { name: "Dump someone elses data by their driver name", index: 1 },
            { name: "Dump someone elses data by their personaId", index: 2 }
        ];

        let optionString = "";
        options.forEach(a => optionString += ` [${a.index}] ${a.name}\n`);

        const option = await askQuestion(`\nSelect an option:\n${optionString}`);
        
        if (!options.find(x => x.index == Number(option))) {
            console.log("ERROR: Not a valid option...\nClosing in 5 seconds...");
            await sleep(5000);
            process.exit(0);
        }

        let servers = "";
        serverList.forEach((s, idx) => servers += ` [${idx}] ${s.name} (${s.category})\n`);
    
        const ans = await askQuestion(`\nSelect a server:\n${servers}`);
    
        if (serverList[ans]) server = serverList[ans];
        if (serverList.find(i => i.name == ans)) server = serverList.find(i => i.name == ans);

        if (Number(option) == 1 || Number(option) == 2) dumpSomeone = true;

        if (!server) {
            console.log("ERROR: Not a valid option / server not found...\nClosing in 5 seconds...");
            await sleep(5000);
            process.exit(0);
        }

        dumpFolder = path.join(dumpFolder, server.name.replace(/[/\\?%*:|"<>]/g, ''));
        if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

        sbrwClient = new SBRW(server.url);

        await sleep(1000);

        // Authenticate User and Get Session
        let session;
        
        try {
            session = await sbrwClient.authenticateUser(config.email, config.password);
        } catch (err) {
            logError(err);
            return;
        }

        if (session.status >= 300) return logError(session);

        console.log(`\nLogged in as ${config.email}\n`);
        console.log("Successfully got Permanent Session!");

        let sessionData = await xmlParser.parseXML(session.data);

        // Select driver
        if (!dumpSomeone) {
            if (!sessionData.UserInfo.personas[0].ProfileData) {
                console.log("\nERROR: This account is new, please set the driver up before you use this program.\nClosing in 5 seconds...");
                await sleep(5000);
                process.exit(0);
            }

            let drivers = [];

            for (let i in sessionData.UserInfo.personas[0].ProfileData) {
                let driver = sessionData.UserInfo.personas[0].ProfileData[i];
                drivers.push({ personaId: driver.PersonaId[0], name: driver.Name[0], index: Number(i) })
            }

            let driverList = "";
            drivers.forEach(val => driverList += ` [${val.index}] ${val.name} (personaId: ${val.personaId})\n`);

            const answer = await askQuestion(`\nSelect your driver:\n${driverList}`);

            let driver;

            if (drivers.find(x => x.personaId == Number(answer))) driver = drivers.find(x => x.personaId == Number(answer));
            if (drivers.find(x => x.name.toLowerCase() == answer.toLowerCase())) driver = drivers.find(x => x.name.toLowerCase() == answer.toLowerCase());
            if (drivers.find(x => x.index == Number(answer))) driver = drivers.find(x => x.index == Number(answer));

            if (driver) personaId = driver.personaId;
            else {
                console.log("\nERROR: Not a driver, try again later.\nClosing in 5 seconds...");
                await sleep(5000);
                process.exit(0);
            }

            dumpFolder = path.join(dumpFolder, `${driver.name} (${personaId})`);
            if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

            dumpFolder = path.join(dumpFolder, newDate);
            fs.mkdirSync(dumpFolder);
        } else if (Number(option) == 1) {
            const driverName = await askQuestion("\nEnter a driver name to dump: ");
            let driverSearch;
            
            try {
                driverSearch = await sbrwClient.getPersonaPresence(driverName);
            } catch (err) {
                logError(err);
                return;
            }

            if (driverSearch.status >= 300) {
                logError(driverSearch);
                console.log("This driver does not exist, please enter a valid driver name next time.");
                return;
            }

            let parsedSearch = await xmlParser.parseXML(driverSearch.data);
            personaId = parsedSearch.PersonaPresence.personaId[0];

            let personaInfo;

            try {
                personaInfo = await sbrwClient.getPersonaInfo(personaId);
            } catch (err) {
                logError(err);
                return;
            }

            if (personaInfo.status >= 300) return logError(personaInfo);

            let parsedPersonaInfo = await xmlParser.parseXML(personaInfo.data);

            dumpFolder = path.join(dumpFolder, `${parsedPersonaInfo.ProfileData.Name[0]} (${personaId})`);
            if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

            dumpFolder = path.join(dumpFolder, newDate);
            fs.mkdirSync(dumpFolder);

            console.log(`\nDriver ${parsedPersonaInfo.ProfileData.Name[0]} (personaId: ${personaId}) will now be dumped...\n`);
        } else if (Number(option) == 2) {
            const persona = await askQuestion("\nEnter a personaId to dump: ");

            let personaInfo;

            try {
                personaInfo = await sbrwClient.getPersonaInfo(persona);
            } catch (err) {
                logError(err);
                return;
            }
            
            if (personaInfo.status >= 300) {
                logError(personaInfo);
                console.log("The personaId you entered does not exist, please enter a valid personaId next time.");
                return;
            }

            let personaResults = await xmlParser.parseXML(personaInfo.data);
            personaId = personaResults.ProfileData.PersonaId[0];

            dumpFolder = path.join(dumpFolder, `${personaResults.ProfileData.Name[0]} (${personaId})`);
            if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

            dumpFolder = path.join(dumpFolder, newDate);
            fs.mkdirSync(dumpFolder);

            console.log(`\nDriver ${personaResults.ProfileData.Name[0]} (personaId: ${personaId}) will now be dumped...\n`);
        }

        if (!dumpSomeone) {
            await sleep(1000);

            // Login to specified driver
            let loginPersona;

            try {
                loginPersona = await sbrwClient.secureLoginPersona(personaId);
            } catch (err) {
                logError(err);
                return;
            }

            if (loginPersona.status >= 300) return logError(loginPersona);

            console.log("\nSuccessfully logged in to driver!");
        }

        await sleep(1000);

        // Dump owned cars
        let cars;

        try {
            cars = await sbrwClient.getCarSlots(personaId, { dumpSomeone });
        } catch (err) {
            logError(err);
            return;
        }

        if (cars.status >= 300) return logError(cars);

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

            fs.writeFileSync(path.join(dumpFolder, "carslots.xml"), xmlParser.buildXML(carslotsTemplate));
        } else {
            fs.writeFileSync(path.join(dumpFolder, "carslots.xml"), cars.data);
        }

        console.log("Car slots successfully dumped! (carslots.xml)");

        await sleep(1000);

        if (!dumpSomeone) {
            // Dump treasure hunt info
            let treasureHunt;

            try {
                treasureHunt = await sbrwClient.getTreasureHunt();
            } catch (err) {
                logError(err);
                return;
            }

            if (treasureHunt.status >= 300) return logError(treasureHunt);

            fs.writeFileSync(path.join(dumpFolder, "gettreasurehunteventsession.xml"), treasureHunt.data);
            console.log("TreasureHuntSession successfully dumped! (gettreasurehunteventsession.xml)");

            await sleep(1000);

            // Dump friends list
            let friendsList;

            try {
                friendsList = await sbrwClient.getFriendsList();
            } catch (err) {
                logError(err);
                return;
            }

            if (friendsList.status >= 300) return logError(friendsList);

            fs.writeFileSync(path.join(dumpFolder, "getfriendlistfromuserid.xml"), friendsList.data);
            console.log("FriendsList successfully dumped! (getfriendlistfromuserid.xml)");

            await sleep(1000);

            // Dump achievements
            let achievements;

            try {
                achievements = await sbrwClient.getAchievements();
            } catch (err) {
                logError(err);
                return;
            }

            if (achievements.status >= 300) return logError(achievements);

            fs.writeFileSync(path.join(dumpFolder, "loadall.xml"), achievements.data);
            console.log("Achievements successfully dumped! (loadall.xml)");

            await sleep(1000);

            // Dump inventory
            let inventory;

            try {
                inventory = await sbrwClient.getInventory();
            } catch (err) {
                logError(err);
                return;
            }

            if (inventory.status >= 300) return logError(inventory);

            fs.writeFileSync(path.join(dumpFolder, "objects.xml"), inventory.data);
            console.log("Inventory successfully dumped! (objects.xml)");
        
            await sleep(1000);
        }

        // Dump driver info
        let personaInfo;
        
        try {
            personaInfo = await sbrwClient.getPersonaInfo(personaId);
        } catch (err) {
            logError(err);
            return;
        }

        if (personaInfo.status >= 300) return logError(personaInfo);

        fs.writeFileSync(path.join(dumpFolder, "GetPersonaInfo.xml"), personaInfo.data);
        console.log("Driver Info successfully dumped! (GetPersonaInfo.xml)");

        await sleep(1000);

        // Dump driver base info
        let personaBase;

        try {
            personaBase = await sbrwClient.getPersonaBase(personaId);
        } catch (err) {
            logError(err);
            return;
        }

        if (personaBase.status >= 300) return logError(personaBase);

        fs.writeFileSync(path.join(dumpFolder, "GetPersonaBase.xml"), personaBase.data);
        console.log("Driver Base Info successfully dumped! (GetPersonaBase.xml)");

        await sleep(1000);

        if (!dumpSomeone) {
            // Log out
            let logout;
            
            try {
                logout = await sbrwClient.secureLogout(personaId);
            } catch (err) {
                logError(err);
                return;
            }

            if (logout.status >= 300) return logError(logout);
        }

        console.log(`\nLogged out of ${config.email}`);

    } else {
        console.log("Okay, have a good day.");
        await sleep(2000)
        process.exit(0);
    }
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function askQuestion(question) {
    let promise = await new Promise((resolve, reject) => {
        ReadLine.question(question, (ans) => resolve(ans));
    })
    return promise;
}

function logError(msg) {
    console.log(`\x1b[31mERROR\x1b[0m:`, msg);
}
