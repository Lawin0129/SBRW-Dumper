const config = require("./Config/config.json");
const xml2js = require("xml2js");
const XML2JS = new xml2js.Parser();
const fs = require("fs");
const path = require("path");
const ReadLine = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
});

const requests = require("./managers/requests.js");

ReadLine.question("Would you like to dump your SBRW data? (y/n)\n", async (Answer) => {
    let personaId;
    let server;
    let newDate = (new Date().toISOString()).replace(/:/ig, "-").replace("T", " ").replace("Z", "").split(".")[0]
    let dumpFolder = path.join(__dirname, "Dumped");

    if (Answer.toLowerCase() == "yes" || Answer.toLowerCase() == "y") {
        if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

        const serverList = await requests.GetServerList();
        if (serverList.status >= 400) return console.log({ error: serverList.data, solution: "Unknown" });
    
        let servers = "";
        serverList.data.forEach(a => servers += ` [${a.index}] ${a.name}\n`);
    
        const ans = await askQuestion(`\nSelect a server:\n${servers}`);
    
        if (serverList.data.find(i => i.index == Number(ans))) server = serverList.data.find(i => i.index == Number(ans));
        if (serverList.data.find(i => i.name == ans)) server = serverList.data.find(i => i.name == ans);
    
        if (!server) {
            console.log("ERROR: Not a valid option.\nClosing in 5 seconds...");
            await sleep(5000);
            process.exit(0);
        }

        dumpFolder = path.join(dumpFolder, server.name.replace(/[/\\?%*:|"<>]/g, ''));
        if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

        await sleep(2000);

        // Authenticate User and Get Session
        const session = await requests.authenticateUser(config.email, config.password, server.url);
        let sessionData;
        if (session.status >= 400) return console.log(session);

        XML2JS.parseString(session.data, (err, result) => sessionData = result);

        if (!sessionData.UserInfo.personas[0].ProfileData) {
            console.log("\nERROR: This account is new, please set the driver up before you use this program.\nClosing in 5 seconds...");
            await sleep(5000);
            process.exit(0);
        }

        // Select driver
        if (sessionData.UserInfo.personas[0].ProfileData.length > 0) {
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

            dumpFolder = path.join(dumpFolder, `${driver.name} (${driver.personaId})`);
            if (!fs.existsSync(dumpFolder)) fs.mkdirSync(dumpFolder);

            dumpFolder = path.join(dumpFolder, newDate);
            fs.mkdirSync(dumpFolder);
        }

        await sleep(1000);

        // Login to specified driver
        const loginPersona = await requests.SecureLoginPersona(personaId);
        if (loginPersona.status >= 400) return console.log({ error: loginPersona.data, solution: "Unknown" });

        console.log("\nSuccessfully logged in to driver!");

        await sleep(1000);

        // Dump owned cars
        const CarSlots = await requests.CarSlots(personaId);
        if (CarSlots.status >= 400) return console.log({ error: CarSlots.data, solution: "Unknown" });

        fs.writeFileSync(path.join(dumpFolder, "carslots.xml"), CarSlots.data);
        console.log("Car slots successfully dumped! (carslots.xml)");

        await sleep(1000);

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

        // Dump inventory
        const Inventory = await requests.GetInventory();
        if (Inventory.status >= 400) return console.log({ error: Inventory.data, solution: "Unknown" });

        fs.writeFileSync(path.join(dumpFolder, "objects.xml"), Inventory.data);
        console.log("Inventory successfully dumped! (objects.xml)");

        await sleep(1000);

        // Log out
        const Logout = await requests.SecureLogout(personaId);
        if (Logout.status >= 400) return console.log({ error: Logout.data, solution: "Unknown" });

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