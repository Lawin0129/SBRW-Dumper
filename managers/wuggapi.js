const { default: axios } = require("axios");

async function findUserbyName(driver) {
    if (typeof driver != "string") return "Driver parameter must be a string.";

    const resp = await axios.get(`https://panel.worldunited.gg/api/driver/${driver}`).then((res) => {
        return { status: 200, data: res.data };
    }).catch(err => {
        return { status: 404, data: { Error: `Driver ${driver} not found.`} };
    });

    return resp;
}

module.exports = {
    findUserbyName
}