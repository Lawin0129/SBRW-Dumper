const config = require("../Config/config.json");
const fs = require("fs");
const path = require("path");
const ReadLine = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
});

const xmlParser = require("./utils/xmlParser");
const sbrw = require("./services/sbrw");

ReadLine.question("Would you like to dump your SBRW data? (y/n)\n", async (Answer) => {
    let dumpSomeone = false;
    let personaId;
    let server;
    let newDate = (new Date().toISOString()).replace(/:/ig, "-").replace("T", " ").replace("Z", "").split(".")[0]
    let dumpFolder = path.join(__dirname, "..", "Dumped");

    if (Answer.toLowerCase() == "yes" || Answer.toLowerCase() == "y") {
        if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

        let serverList;

        try {
            serverList = await sbrw.GetServerList();
        } catch (err) {
            logError({ error: err, solution: "Unknown" });
            return;
        }

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
        serverList.forEach((s, idx) => servers += ` [${idx}] ${s.name}\n`);
    
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

        await sleep(1000);

        // Authenticate User and Get Session
        let session;
        
        try {
            session = await sbrw.authenticateUser(config.email, config.password, server.url);
        } catch (err) {
            logError(err);
            return;
        }

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
            const driver = await askQuestion("\nEnter a driver name to dump: ");
            let driverSearch;
            
            try {
                driverSearch = await sbrw.GetPersonaPresence(driver);
            } catch (err) {
                logError(err);
                console.log("This driver does not exist, please enter a valid driver name next time.");
                return;
            }

            let parsedSearch = await xmlParser.parseXML(driverSearch.data);
            personaId = parsedSearch.PersonaPresence.personaId[0];

            let personaInfo;

            try {
                personaInfo = await sbrw.GetPersonaInfo(personaId);
            } catch (err) {
                logError(err);
                return;
            }

            let parsedPersonaInfo = await xmlParser.parseXML(personaInfo.data);

            dumpFolder = path.join(dumpFolder, `${parsedPersonaInfo.ProfileData.Name[0]} (${personaId})`);
            if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

            dumpFolder = path.join(dumpFolder, newDate);
            fs.mkdirSync(dumpFolder);

            console.log(`\nDriver ${parsedPersonaInfo.ProfileData.Name[0]} (personaId: ${personaId}) will now be dumped...\n`);
        } else if (Number(option) == 2) {
            const persona = await askQuestion("\nEnter a personaId to dump: ");

            let PersonaInfo;

            try {
                PersonaInfo = await sbrw.GetPersonaInfo(persona);
            } catch (err) {
                logError(err);
                console.log("The personaId you entered does not exist, please enter a valid personaId next time.");
                return;
            }

            let personaResults = await xmlParser.parseXML(PersonaInfo.data);
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
                loginPersona = await sbrw.SecureLoginPersona(personaId);
            } catch (err) {
                logError(err);
                return;
            }

            console.log("\nSuccessfully logged in to driver!");
        }

        await sleep(1000);

        // Dump owned cars
        let Cars;

        try {
            Cars = await sbrw.CarSlots(personaId, { dumpSomeone });
        } catch (err) {
            logError(err);
            return;
        }

        // convert cars into carslots
        if (dumpSomeone) {
            let carsResults = await xmlParser.parseXML(Cars.data);

            let DefaultCar;
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
                DefaultCar = await sbrw.DefaultCar(personaId);
            } catch {}

            if (DefaultCar) defaultCarResults = await xmlParser.parseXML(DefaultCar.data);

            if (defaultCarResults) {
                let carIndex = carsResults.ArrayOfOwnedCarTrans.OwnedCarTrans.findIndex(i => JSON.stringify(i) == JSON.stringify(defaultCarResults.OwnedCarTrans));

                if (carIndex != -1) {
                    carslotsTemplate.CarSlotInfoTrans.DefaultOwnedCarIndex = [`${carIndex}`];
                }
            }

            carslotsTemplate.CarSlotInfoTrans.CarsOwnedByPersona[0].OwnedCarTrans = carsResults.ArrayOfOwnedCarTrans.OwnedCarTrans;

            fs.writeFileSync(path.join(dumpFolder, "carslots.xml"), xmlParser.buildXML(carslotsTemplate));
        } else {
            fs.writeFileSync(path.join(dumpFolder, "carslots.xml"), Cars.data);
        }

        console.log("Car slots successfully dumped! (carslots.xml)");

        await sleep(1000);

        if (!dumpSomeone) {
            // Dump treasure hunt info
            let TreasureHunt;

            try {
                TreasureHunt = await sbrw.GetTreasureHunt();
            } catch (err) {
                logError(err);
                return;
            }

            fs.writeFileSync(path.join(dumpFolder, "gettreasurehunteventsession.xml"), TreasureHunt.data);
            console.log("TreasureHuntSession successfully dumped! (gettreasurehunteventsession.xml)");

            await sleep(1000);

            // Dump friends list
            let FriendsList;

            try {
                FriendsList = await sbrw.GetFriendsList();
            } catch (err) {
                logError(err);
                return;
            }

            fs.writeFileSync(path.join(dumpFolder, "getfriendlistfromuserid.xml"), FriendsList.data);
            console.log("FriendsList successfully dumped! (getfriendlistfromuserid.xml)");

            await sleep(1000);

            // Dump achievements
            let Achievements;

            try {
                Achievements = await sbrw.GetAchievements();
            } catch (err) {
                logError(err);
                return;
            }

            fs.writeFileSync(path.join(dumpFolder, "loadall.xml"), Achievements.data);
            console.log("Achievements successfully dumped! (loadall.xml)");

            await sleep(1000);

            // Dump inventory
            let Inventory;

            try {
                Inventory = await sbrw.GetInventory();
            } catch (err) {
                logError(err);
                return;
            }

            fs.writeFileSync(path.join(dumpFolder, "objects.xml"), Inventory.data);
            console.log("Inventory successfully dumped! (objects.xml)");
        
            await sleep(1000);
        }

        // Dump driver info
        let PersonaInfo;
        
        try {
            PersonaInfo = await sbrw.GetPersonaInfo(personaId);
        } catch (err) {
            logError(err);
            return;
        }

        fs.writeFileSync(path.join(dumpFolder, "GetPersonaInfo.xml"), PersonaInfo.data);
        console.log("Driver Info successfully dumped! (GetPersonaInfo.xml)");

        await sleep(1000);

        // Dump driver base info
        let PersonaBase;

        try {
            PersonaBase = await sbrw.GetPersonaBase(personaId);
        } catch (err) {
            logError(err);
            return;
        }

        fs.writeFileSync(path.join(dumpFolder, "GetPersonaBase.xml"), PersonaBase.data);
        console.log("Driver Base Info successfully dumped! (GetPersonaBase.xml)");

        await sleep(1000);

        if (!dumpSomeone) {
            // Log out
            let Logout;
            
            try {
                Logout = await sbrw.SecureLogout(personaId);
            } catch (err) {
                logError(err);
                return;
            }
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
