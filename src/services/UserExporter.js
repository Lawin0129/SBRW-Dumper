const path = require("path");
const fsExtra = require("../utils/fs");

class UserExporter {
    #saveDirectoryPath;
    #dirReady;
    #persona;
    constructor(serverName, { personaName, personaId }) {
        this.#saveDirectoryPath = path.join(
            process.cwd(),
            "Dumped",
            fsExtra.safeFileName(serverName),
            fsExtra.safeFileName(`${personaName} (${personaId})`),
            new Date().toISOString().replace(/:/ig, "-").replace("T", " ").replace("Z", "").split(".")[0]
        );
        this.#persona = { name: personaName, id: personaId };
    }

    get saveDirectoryPath() {
        return this.#saveDirectoryPath;
    }

    get dirReady() {
        return this.#dirReady;
    }

    get persona() {
        return { ...this.#persona };
    }

    async ensureDir() {
        if (this.#dirReady) return;
        await fsExtra.createDir(this.#saveDirectoryPath);
        this.#dirReady = true;
    }

    async #saveXml(fileName, data) {
        await this.ensureDir();
        const filePath = path.join(this.#saveDirectoryPath, fileName);
        return await fsExtra.saveAndGetMetadata(filePath, data);
    }

    async savePersonaInfo(personaInfoData) {
        return this.#saveXml("GetPersonaInfo.xml", personaInfoData);
    }
    
    async savePersonaBaseInfo(personaBaseInfoData) {
        return this.#saveXml("GetPersonaBase.xml", personaBaseInfoData);
    }
    
    async saveCarslots(carslotsData) {
        return this.#saveXml("carslots.xml", carslotsData);
    }
    
    async saveAchievements(achievementsData) {
        return this.#saveXml("loadall.xml", achievementsData);
    }
    
    async saveInventory(inventoryData) {
        return this.#saveXml("objects.xml", inventoryData);
    }

    async saveTreasureHunt(treasureHuntData) {
        return this.#saveXml("gettreasurehunteventsession.xml", treasureHuntData);
    }
    
    async saveFriendsList(friendsListData) {
        return this.#saveXml("getfriendlistfromuserid.xml", friendsListData);
    }
}

module.exports = UserExporter;
