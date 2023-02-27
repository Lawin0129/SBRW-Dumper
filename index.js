const config = require("./Config/config.json");
const xml2js = require("xml2js");
const XML2JS = new xml2js.Parser();
const builder = new xml2js.Builder({ renderOpts: { pretty: false }, headless: true });
const fs = require("fs");
const path = require("path");
const ReadLine = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
});

const requests = require("./managers/requests.js");

ReadLine.question("Would you like to dump your SBRW data? (y/n)\n", async (Answer) => {
    let dumpSomeone = false;
    let personaId;
    let server;
    let newDate = (new Date().toISOString()).replace(/:/ig, "-").replace("T", " ").replace("Z", "").split(".")[0]
    let dumpFolder = path.join(__dirname, "Dumped");

    if (Answer.toLowerCase() == "yes" || Answer.toLowerCase() == "y") {
        if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

        const serverList = await requests.GetServerList();
        if (serverList.status >= 400) return console.log({ error: serverList.data, solution: "Unknown" });

        const options = [
            { name: "Dump your own data", index: 0 },
            { name: "Dump someone elses data by their driver name", index: 1 },
            { name: "Dump someone elses data by their personaId", index: 2 }
        ];

        let optionString = "";
        options.forEach(a => optionString += ` [${a.index}] ${a.name}\n`);

        const option = await askQuestion(`\nSelect an option:\n${optionString}`);

        let servers = "";
        serverList.data.forEach(a => servers += ` [${a.index}] ${a.name}\n`);
    
        const ans = await askQuestion(`\nSelect a server:\n${servers}`);
    
        if (serverList.data.find(i => i.index == Number(ans))) server = serverList.data.find(i => i.index == Number(ans));
        if (serverList.data.find(i => i.name == ans)) server = serverList.data.find(i => i.name == ans);

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
        const session = await requests.authenticateUser(config.email, config.password, server.url);
        let sessionData;
        if (session.status >= 400) return console.log(session);

        XML2JS.parseString(session.data, (err, result) => sessionData = result);

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
            let driverSearch = await requests.GetPersonaPresence(driver);
            if (driverSearch.status >= 400) return console.log({ error: driverSearch.data, solution: "This driver does not exist, please enter a valid driver name next time." });

            XML2JS.parseString(driverSearch.data, (err, result) => driverSearch = result);

            personaId = driverSearch.PersonaPresence.personaId[0];

            let PersonaInfo = await requests.GetPersonaInfo(personaId);
            if (PersonaInfo.status >= 400) return console.log({ error: PersonaInfo.data, solution: "Unknown" });

            XML2JS.parseString(PersonaInfo.data, (err, result) => PersonaInfo = result);

            dumpFolder = path.join(dumpFolder, `${PersonaInfo.ProfileData.Name[0]} (${personaId})`);
            if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

            dumpFolder = path.join(dumpFolder, newDate);
            fs.mkdirSync(dumpFolder);

            console.log(`\nDriver ${PersonaInfo.ProfileData.Name[0]} (personaId: ${personaId}) will now be dumped...\n`);
        } else if (Number(option) == 2) {
            const persona = await askQuestion("\nEnter a personaId to dump: ");

            let personaResults;
            const PersonaInfo = await requests.GetPersonaInfo(persona);
            if (PersonaInfo.status >= 400) return console.log({ error: PersonaInfo.data, solution: "The personaId you entered does not exist, please enter a valid personaId next time." });

            XML2JS.parseString(PersonaInfo.data, (err, result) => personaResults = result);

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
            const loginPersona = await requests.SecureLoginPersona(personaId);
            if (loginPersona.status >= 400) return console.log({ error: loginPersona.data, solution: "Unknown" });

            console.log("\nSuccessfully logged in to driver!");
        }

        await sleep(1000);

        // Dump owned cars
        const CarSlots = await requests.CarSlots(personaId, { dumpSomeone });
        if (CarSlots.status >= 400) return console.log({ error: CarSlots.data, solution: "Unknown" });

        // some trolling
        if (dumpSomeone) {
            let carsResults;
            let defaultCarResults;
            let carslotsTemplate = {
                CarSlotInfoTrans: {
                    CarsOwnedByPersona: [{ OwnedCarTrans: [] }],
                    DefaultOwnedCarIndex: ["0"],
                    ObtainableSlots: [""],
                    OwnedCarSlotsCount: ["350"]
                }
            }

            const DefaultCar = await requests.DefaultCar(personaId);

            XML2JS.parseString(CarSlots.data, (err, result) => carsResults = result);
            if (DefaultCar.status == 200) XML2JS.parseString(DefaultCar.data, (err, result) => defaultCarResults = result);

            if (defaultCarResults) {
                let carIndex = carsResults.ArrayOfOwnedCarTrans.OwnedCarTrans.findIndex(i => JSON.stringify(i) == JSON.stringify(defaultCarResults.OwnedCarTrans));

                if (carIndex) {
                    carslotsTemplate.CarSlotInfoTrans.DefaultOwnedCarIndex[0] = `${carIndex}`;
                }
            }

            carslotsTemplate.CarSlotInfoTrans.CarsOwnedByPersona[0].OwnedCarTrans = carsResults.ArrayOfOwnedCarTrans.OwnedCarTrans;

            fs.writeFileSync(path.join(dumpFolder, "carslots.xml"), builder.buildObject(carslotsTemplate));
        } else {
            fs.writeFileSync(path.join(dumpFolder, "carslots.xml"), CarSlots.data);
        }

        console.log("Car slots successfully dumped! (carslots.xml)");

        await sleep(1000);

        if (!dumpSomeone) {
            // Dump treasure hunt info
            const TreasureHunt = await requests.GetTreasureHunt();
            if (TreasureHunt.status >= 400) return console.log({ error: TreasureHunt.data, solution: "Unknown" });

            fs.writeFileSync(path.join(dumpFolder, "gettreasurehunteventsession.xml"), TreasureHunt.data);
            console.log("TreasureHuntSession successfully dumped! (gettreasurehunteventsession.xml)");

            await sleep(1000);

            // Dump friends list
            const FriendsList = await requests.GetFriendsList();
            if (FriendsList.status >= 400) return console.log({ error: FriendsList.data, solution: "Unknown" });

            fs.writeFileSync(path.join(dumpFolder, "getfriendlistfromuserid.xml"), FriendsList.data);
            console.log("FriendsList successfully dumped! (getfriendlistfromuserid.xml)");

            await sleep(1000);

            // Dump achievements
            const Achievements = await requests.GetAchievements();
            if (Achievements.status >= 400) return console.log({ error: Achievements.data, solution: "Unknown" });

            fs.writeFileSync(path.join(dumpFolder, "loadall.xml"), Achievements.data);
            console.log("Achievements successfully dumped! (loadall.xml)");

            await sleep(1000);

            // Dump inventory
            const Inventory = await requests.GetInventory();
            if (Inventory.status >= 400) return console.log({ error: Inventory.data, solution: "Unknown" });
        
            fs.writeFileSync(path.join(dumpFolder, "objects.xml"), Inventory.data);
            console.log("Inventory successfully dumped! (objects.xml)");
        
            await sleep(1000);
        }

        // Dump driver info
        const PersonaInfo = await requests.GetPersonaInfo(personaId);
        if (PersonaInfo.status >= 400) return console.log({ error: PersonaInfo.data, solution: "Unknown" });

        fs.writeFileSync(path.join(dumpFolder, "GetPersonaInfo.xml"), PersonaInfo.data);
        console.log("Driver Info successfully dumped! (GetPersonaInfo.xml)");

        await sleep(1000);

        // Dump driver base info
        const PersonaBase = await requests.GetPersonaBase(personaId);
        if (PersonaBase.status >= 400) return console.log({ error: PersonaBase.data, solution: "Unknown" });

        fs.writeFileSync(path.join(dumpFolder, "GetPersonaBase.xml"), PersonaBase.data);
        console.log("Driver Base Info successfully dumped! (GetPersonaBase.xml)");

        await sleep(1000);

        if (!dumpSomeone) {
            // Log out
            const Logout = await requests.SecureLogout(personaId);
            if (Logout.status >= 400) return console.log({ error: Logout.data, solution: "Unknown" });
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
