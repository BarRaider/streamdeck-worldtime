const FETCH_FAILED_COOLDOWN_TIME_MS = 120000;
const SUNSET_FETCH_COOLDOWN_TIME_MS = 10800000; // 3 Hours
const LONG_CLICK_MS = 600;
const STATE_CLOCK = 0;
const STATE_SUNRISE = 1;

var websocket = null;
var pluginUUID = null;
var settingsCache = {};
var sunsetCache = {};
var keydownCache = {}
var onTickCache = {};
var lastTimeCache = {};
var cityOffset = {};
var lastFetchFailedTime;
var fetchFailed = false;
var DestinationEnum = Object.freeze({ "HARDWARE_AND_SOFTWARE": 0, "HARDWARE_ONLY": 1, "SOFTWARE_ONLY": 2 })

var worldTimeAction = {

    type: "com.barraider.worldtime",
    constructior: function () {
    },

    onKeyDown: function (context, settings, state, coordinates, userDesiredState) {
        keydownCache[context] = new Date();
        console.log("keydown");

        // For testing purposes
        //testAllZones();
    },

    onKeyUp: function (context, settings, state, coordinates, userDesiredState) {
        try {

            let clickTime = keydownCache[context];
            keydownCache[context] = null;
            console.log("keyup", clickTime);
            if (clickTime != null) {
                if (!settings.hasOwnProperty('state')) {
                    settings['state'] = 0;
                }
                let newState = ((settings['state'] + 1) % 2);
                if (newState === 0 || (newState === 1 && this.SunsetSettingsValid(context))) {
                    settings['state'] = newState;
                    this.SetSettings(context, settings);
                }
            }
        }
        catch (err) {
            this.LogMessage("onKeyUp ERROR: " + err);
        }
    },

    onTick: function (context) {
        var payload = settingsCache[context];

        let currTime = new Date();
        let clickTime = keydownCache[context];
        if (clickTime != null && currTime - clickTime >= LONG_CLICK_MS) {
            keydownCache[context] = null;
            this.HandleLongClick(context);
        }

        if (payload != null && payload.hasOwnProperty('city')) {
            let cityName = payload['city'];

            if (!cityOffset.hasOwnProperty(cityName)) {
                console.log("No data for " + cityName, cityOffset);
                getCityOffset(cityName);
            }

            if (fetchFailed) {
                this.SetTitle(context, 'Server\nError');
                return;
            }

            let offsetMinutes = cityOffset[cityName];
            if (offsetMinutes === undefined) {
                return;
            }

            if (payload["state"] === STATE_SUNRISE) {
                this.ShowSunrise(context, payload);
            }
            else {
                this.ShowClock(offsetMinutes, context, payload);
            }
        }
    },

    onWillAppear: function (context, settings, coordinates) {

        var self = this;
        console.log("onWillAppear context: ", context, " settings: ", settings);

        // Backwards compatibility v1.9 -> v2.0
        if (settings["showSeconds"]) {
            console.log("backwards compatibility, showing seconds");
            settings["showSeconds"] = false;
            settings["timeFormat"] = "hh:mm:ss";
            this.SetSettings(context, settings);
        }
        else if (typeof settings["timeFormat"] == 'undefined') {
            console.log("backwards compatibility, setting default format");
            settings["timeFormat"] = "hh:mm";
            this.SetSettings(context, settings);
        }


        settingsCache[context] = settings;

        let timer = onTickCache[context];
        if (timer != null) {
            clearInterval(timer);
        }

        this.HandleBackground(context, settings);

        onTickCache[context] = setInterval(function () { self.onTick(context); }, 1000);
    },
    onWillDisappear: function (context, settings, coordinates) {

        var self = this;
        console.log("onWillDisappear context: ", context, " settings: ", settings);

        let timer = onTickCache[context];
        if (timer != null) {
            clearInterval(timer);
        }
    },

    GetTitlePrefix: function (payload) {
        let cityNameShort = "";
        if (payload.hasOwnProperty('title') && payload['title']) {
            cityNameShort = payload['title'];
        }
        else if (payload.hasOwnProperty('showCityName') && payload['showCityName']) {
            let cityName = payload['city'];
            var idx = cityName.indexOf("/") + 1;
            cityNameShort = cityName.substring(idx).replace("_", " ");
            if (cityNameShort.length > 6) {
                cityNameShort = cityNameShort.slice(0, 5) + "-\r\n" + cityNameShort.substring(5);
            }
            else {
                cityNameShort = cityNameShort + "\r\n";
            }
        }
        return cityNameShort;
    },

    ShowClock: function (offsetMinutes, context, payload) {

        let cityNameShort = this.GetTitlePrefix(payload);
        var offsetTime = getDateFromOffset(new Date(), offsetMinutes);

        let show24Hours = false;
        if (payload.hasOwnProperty('show24hours')) {
            show24Hours = payload['show24hours']
        }

        let showAMPM = false;
        if (payload.hasOwnProperty('showAMPM')) {
            showAMPM = payload['showAMPM']
        }

        let hideClock = false;
        if (payload.hasOwnProperty('hideClock')) {
            hideClock = payload['hideClock']
        }

        let showDateDDMM = false;
        if (payload.hasOwnProperty('showDateDDMM')) {
            showDateDDMM = payload['showDateDDMM']
        }

        let showDateMMDD = false;
        if (payload.hasOwnProperty('showDateMMDD')) {
            showDateMMDD = payload['showDateMMDD']
        }

        let showHours = false;
        let showMinutes = false;
        let showSeconds = false;
        if (payload.hasOwnProperty('timeFormat')) {
            let clockFormat = payload['timeFormat'];
            showHours = clockFormat.includes("hh");
            showMinutes = clockFormat.includes("mm");
            showSeconds = clockFormat.includes("ss");

        }

        let strSeconds = '';
        if (showSeconds) {
            strSeconds = ("0" + offsetTime.getSeconds()).slice(-2);
        }

        let strTime = '';
        if (!hideClock) {
            strTime = formatTime(offsetTime, showHours, show24Hours, showAMPM, showMinutes, showSeconds);
        }
        lastTimeCache[context] = strTime; // Used for Copy to clipboard

        if (showDateDDMM || showDateMMDD) {
            let day = offsetTime.getDate();
            let monthIndex = offsetTime.getMonth() + 1;
            let result;
            if (showDateDDMM) {
                result = day + "/" + monthIndex;
            }
            else {
                result = monthIndex + "/" + day;
            }

            // Check if we already have the time in strTime
            if (strTime === '') {
                lastTimeCache[context] = result; // Used for Copy to clipboard
                strTime = result;
            }
            else { // Not empty
                lastTimeCache[context] = strTime + ' ' + result; // Used for Copy to clipboard
                strTime = strTime + '\n' + result;
            }
        }

        if (cityNameShort.length > 0) {
            strTime = cityNameShort + "\r\n" + strTime;
        }
        this.SetTitle(context, strTime);
    },

    ShowSunrise: function (context, payload) {
        let cityName = payload['city'];
        let cityNameShort = this.GetTitlePrefix(payload);
        fetchSunset(payload["sunLat"], payload["sunLon"], cityName);

        if (sunsetCache == null || !sunsetCache.hasOwnProperty(cityName)) {
            this.LogMessage("Error getting sunrise cache for " + cityName);
            return;
        }

        let show24Hours = false;
        if (payload.hasOwnProperty('show24hours')) {
            show24Hours = payload['show24hours']
        }

        let showAMPM = false;
        if (payload.hasOwnProperty('showAMPM')) {
            showAMPM = payload['showAMPM']
        }

        let sunsetInfo = sunsetCache[cityName];
        strTime = "🌞 " + formatTime(sunsetInfo["sunrise"], true, show24Hours, showAMPM, true, false) + "\n";
        strTime += "🌙 " + formatTime(sunsetInfo["sunset"], true, show24Hours, showAMPM, true, false)

        if (cityNameShort.length > 0) {
            strTime = cityNameShort + "\n" + strTime;
        }
        this.SetTitle(context, strTime);
    },

    SetTitle: function (context, titleText) {
        var json = {
            "event": "setTitle",
            "context": context,
            "payload": {
                "title": "" + titleText,
                "target": DestinationEnum.HARDWARE_AND_SOFTWARE
            }
        };

        websocket.send(JSON.stringify(json));
    },

    SetImage: function (context, base64Image, state) {
        var json = {
            "event": "setImage",
            "context": context,
            "payload": {
                "image": base64Image,
                "target": DestinationEnum.HARDWARE_AND_SOFTWARE,
                "state": state
            }
        };

        websocket.send(JSON.stringify(json));
    },


    SetSettings: function (context, settings) {
        var json = {
            "event": "setSettings",
            "context": context,
            "payload": settings
        };

        websocket.send(JSON.stringify(json));
        settingsCache[context] = settings;
        console.log("New Settings", settings);
        console.log("New JSON", JSON.stringify(json));

        if (!settings.hasOwnProperty("hideBackground")) {
            settings["hideBackground"] = false;
            this.SetSettings(context, settings);
            return;
        }

        this.HandleBackground(context, settings);
    },

    SetState: function (context, state) {
        var json = {
            "event": "setState",
            "context": context,
            "payload": {
                "state": state
            }
        };

        websocket.send(JSON.stringify(json));
    },

    ShowOk: function (context, state) {
        var json = {
            "event": "showOk",
            "context": context,
        };

        websocket.send(JSON.stringify(json));
    },

    LogMessage: function (message) {
        var json = {
            "event": "logMessage",
            "payload": {
                "message": message
            }
        };

        websocket.send(JSON.stringify(json));
        console.log("Log: ", message);
    },

    SunsetSettingsValid: function (context) {
        try {

            settings = settingsCache[context];

            if (settings == null || !settings.hasOwnProperty('city')) {
                return false;
            }

            let cityName = settings['city'];
            getCityOffset(cityName);
            let offsetMinutes = cityOffset[cityName];
            if (offsetMinutes === undefined) {
                return false;
            }

            if (!settings.hasOwnProperty("sunLat") || !settings.hasOwnProperty("sunLon")) {
                return false;
            }

            if (!isNumber(settings["sunLat"]) || !isNumber(settings["sunLon"])) {
                return false;
            }

            fetchSunset(settings["sunLat"], settings["sunLon"], cityName);
            return true;
        }
        catch (err) {
            this.LogMessage("SunsetSettingsValid ERROR: " + err);
        }
        return false;
    },

    HandleLongClick: function (context) {
        try {
            console.log("Long Click");
            let lastTime = lastTimeCache[context];

            if (lastTime != null) {
                copyTextToClipboard(lastTime);
                this.ShowOk(context);
            }
        }
        catch (err) {
            this.LogMessage("HandleLongClick ERROR: " + err);
        }
    },

    HandleBackground: function (context, settings) {
        try {
            if (settings["hideBackground"]) {
                this.SetImage(context, getEmptyImage(), 0);
            }
            else {
                // Set default value
                if (!settings.hasOwnProperty('state')) {
                    settings['state'] = 0;
                }

                let image = null; // Globe
                if (settings["state"] === 1) {
                    image = IMAGE_SUN;
                }
                this.SetImage(context, image, 0);
            }
        }
        catch (err) {
            this.LogMessage("HandleBackground ERROR: " + err);
        }
    }
};

function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
    pluginUUID = inPluginUUID

    // Open the web socket
    websocket = new WebSocket("ws://127.0.0.1:" + inPort);

    function registerPlugin(inPluginUUID) {
        var json = {
            "event": inRegisterEvent,
            "uuid": inPluginUUID
        };

        websocket.send(JSON.stringify(json));
    };

    websocket.onopen = function () {
        // WebSocket is connected, send message
        registerPlugin(pluginUUID);
    };

    websocket.onmessage = function (evt) {
        console.log("onmessage event received!");
        // Received message from Stream Deck
        var jsonObj = JSON.parse(evt.data);
        console.log("onmessage json: ", jsonObj);
        var event = jsonObj['event'];
        var action = jsonObj['action'];
        var context = jsonObj['context'];
        var jsonPayload = jsonObj['payload'] || {};

        if (event == "keyDown") {
            let settings = jsonPayload['settings'];
            let coordinates = jsonPayload['coordinates'];
            let state = jsonPayload['state'];
            let userDesiredState = jsonPayload['userDesiredState'];
            worldTimeAction.onKeyDown(context, settings, state, coordinates, userDesiredState);
        }
        else if (event == "keyUp") {
            let settings = jsonPayload['settings'];
            let coordinates = jsonPayload['coordinates'];
            let state = jsonPayload['state'];
            let userDesiredState = jsonPayload['userDesiredState'];
            worldTimeAction.onKeyUp(context, settings, state, coordinates, userDesiredState);
        }
        else if (event == "willAppear") {
            var settings = jsonPayload['settings'];
            var coordinates = jsonPayload['coordinates'];
            worldTimeAction.onWillAppear(context, settings, coordinates);
        }
        else if (event == "willDisappear") {
            var settings = jsonPayload['settings'];
            var coordinates = jsonPayload['coordinates'];
            worldTimeAction.onWillDisappear(context, settings, coordinates);
        }
        else if (event == "sendToPlugin") {
            console.log("sendToPlugin received payload: ", jsonPayload);
        }
        else if (event == "didReceiveSettings") {
            console.log("didReceiveSettings received payload: ", jsonPayload);
            if (jsonPayload != null && jsonPayload['settings'] != null) {
                worldTimeAction.SetSettings(context, jsonPayload['settings']);
            }
        }
    };

    websocket.onclose = function () {
        // Websocket is closed
    };
};

function isNumber(num) {
    let regex = /^(-?\d+(\.\d+)?)$/;
    return (regex.test(num));
}


function loadImageAsDataUri(url, callback) {
    var image = new Image();

    image.onload = function () {
        var canvas = document.createElement("canvas");

        canvas.width = this.naturalWidth;
        canvas.height = this.naturalHeight;

        var ctx = canvas.getContext("2d");
        ctx.drawImage(this, 0, 0);
        callback(canvas.toDataURL("image/png"));
    };

    image.src = url;
};

function getEmptyImage() {
    let canvas = document.createElement("canvas");

    canvas.width = 144;
    canvas.height = 144;

    let ctx = canvas.getContext("2d");
    ctx.fillStyle = "black";
    ctx.fill();
    return canvas.toDataURL();
}

function getCityOffset(cityName) {
    try {
        var timezone = moment().tz(cityName);
        let offsetMinutes = timezone.utcOffset();
        cityOffset[cityName] = offsetMinutes;
        console.log(cityName, timezone.format(), 'Offset: ', offsetMinutes);
    }
    catch (err) {
        this.LogMessage('getCityOffset failed for: ' + cityName + "\n" + err);
    }
}

function getDateFromOffset(localDateTime, offsetMinutes) {
    var utc = localDateTime.getTime() + (localDateTime.getTimezoneOffset() * 60000);
    var offsetTime = new Date(utc + (60000 * offsetMinutes));
    return offsetTime;
}

function formatTime(time, showHours, show24Hours, showAMPM, showMinutes, showSeconds) {
    let strTime = "";
    let ampm = "";
    let strSeconds = "";
    if (showSeconds) {
        strSeconds = ("0" + time.getSeconds()).slice(-2);
    }

    if (showHours) {
        if (show24Hours) {
            strTime = ("0" + time.getHours()).slice(-2);
        }
        else { // Use AM/PM mode
            let hours = time.getHours();

            if (showAMPM) {
                ampm = hours >= 12 ? "pm" : "am";
            }
            hours = hours % 12;
            hours = hours ? hours : 12; // the hour '0' should be '12'
            strTime += hours;
        }

        if (showMinutes) {
            strTime += ":";
        }

    }

    if (showMinutes) {
        strTime += ("0" + time.getMinutes()).slice(-2);
        if (showSeconds) {
            strTime += ":";
        }
    }

    if (showSeconds) {
        strTime += strSeconds;
    }
    strTime += ampm;

    return strTime;
}

function copyTextToClipboard(text) {
    console.log("Got text: ", text);
    /* Get the text field */
    var copyText = document.getElementById("clipboardDummy");
    copyText.style.display = "";

    /* Set Text */
    copyText.value = text;

    /* Select the text field */
    copyText.select();

    /* Copy the text inside the text field */
    document.execCommand("copy");
    copyText.style.display = "none";
    console.log("Text is: ", copyText.value);
}

function fetchSunset(lat, lon, cityName) {
    let currTime = new Date();

    if (sunsetCache != null && sunsetCache.hasOwnProperty(cityName)) {
        let cache = sunsetCache[cityName];

        let lastFetch = (currTime.getTime() - cache["lastFetch"].getTime());
        if (lastFetch < SUNSET_FETCH_COOLDOWN_TIME_MS) {
            return;
        }
    }

    if (!!lastFetchFailedTime) {
        let cooldownTime = (currTime.getTime() - lastFetchFailedTime.getTime());
        if (cooldownTime < FETCH_FAILED_COOLDOWN_TIME_MS) {
            console.log('Fetch Sunset in cooldown', cooldownTime);
            return;
        }
    }

    let url = "http://api.sunrise-sunset.org/json?formatted=0&lat=" + lat + "&lng=" + lon;
    console.log("url->", url);
    fetch(url)
        .then(res => res.json())
        .catch(err => {
            console.log("Invalid Sunset API Response Error: " + err);
            fetchFailed = true;
            lastFetchFailedTime = new Date();
        })
        .then((out) => {
            console.log('Received JSON ', out);

            if (out["status"] !== "OK") {
                console.log("Invalid Sunset API status for city" + cityName + ": " + out["status"]);
                return;
            }

            let payload = out["results"];
            let offsetMinutes = cityOffset[cityName];

            //console.log('Offset ' + cityName, offsetMinutes);

            let sunriseLocalTime = new Date(payload["sunrise"]);
            let sunsetLocalTime = new Date(payload["sunset"]);

            //console.log("sunrise local", payload["sunrise"], "->", sunriseLocalTime);
            //console.log("sunset local", payload["sunset"], "->", sunsetLocalTime);

            let sunriseUTC = sunriseLocalTime.getTime() + (sunriseLocalTime.getTimezoneOffset() * 60000);
            let sunriseOffset = new Date(sunriseUTC + (60000 * offsetMinutes));

            let sunsetUTC = sunsetLocalTime.getTime() + (sunsetLocalTime.getTimezoneOffset() * 60000);
            let sunsetOffset = new Date(sunsetUTC + (60000 * offsetMinutes));

            //console.log("utc", sunriseUTC, "->", sunsetUTC);
            //console.log('Final ' + cityName, sunriseOffset, '->', sunsetOffset);

            sunsetCache[cityName] = {
                "sunrise": sunriseOffset,
                "sunset": sunsetOffset,
                "lastFetch": currTime
            };
        })
        .catch(err => {
            console.log('Invalid JSON Parsing Error');
            sunsetCache[cityName] = null;
            fetchFailed = true;
            lastFetchFailedTime = new Date();
        });
}

/* TESTS */
function testAllZones() {
    const zones = [
        'Africa/Abidjan',
        'Africa/Accra',
        'Africa/Algiers',
        'Africa/Bissau',
        'Africa/Cairo',
        'Africa/Casablanca',
        'Africa/Ceuta',
        'Africa/El_Aaiun',
        'Africa/Johannesburg',
        'Africa/Juba',
        'Africa/Khartoum',
        'Africa/Lagos',
        'Africa/Maputo',
        'Africa/Monrovia',
        'Africa/Nairobi',
        'Africa/Ndjamena',
        'Africa/Sao_Tome',
        'Africa/Tripoli',
        'Africa/Tunis',
        'Africa/Windhoek',
        'America/Adak',
        'America/Anchorage',
        'America/Araguaina',
        'America/Argentina/Buenos_Aires',
        'America/Argentina/Catamarca',
        'America/Argentina/Cordoba',
        'America/Argentina/Jujuy',
        'America/Argentina/La_Rioja',
        'America/Argentina/Mendoza',
        'America/Argentina/Rio_Gallegos',
        'America/Argentina/Salta',
        'America/Argentina/San_Juan',
        'America/Argentina/San_Luis',
        'America/Argentina/Tucuman',
        'America/Argentina/Ushuaia',
        'America/Asuncion',
        'America/Atikokan',
        'America/Bahia',
        'America/Bahia_Banderas',
        'America/Barbados',
        'America/Belem',
        'America/Belize',
        'America/Blanc-Sablon',
        'America/Boa_Vista',
        'America/Bogota',
        'America/Boise',
        'America/Cambridge_Bay',
        'America/Campo_Grande',
        'America/Cancun',
        'America/Caracas',
        'America/Cayenne',
        'America/Chicago',
        'America/Chihuahua',
        'America/Costa_Rica',
        'America/Creston',
        'America/Cuiaba',
        'America/Curacao',
        'America/Danmarkshavn',
        'America/Dawson',
        'America/Dawson_Creek',
        'America/Denver',
        'America/Detroit',
        'America/Edmonton',
        'America/Eirunepe',
        'America/El_Salvador',
        'America/Fort_Nelson',
        'America/Fortaleza',
        'America/Glace_Bay',
        'America/Godthab',
        'America/Goose_Bay',
        'America/Grand_Turk',
        'America/Guatemala',
        'America/Guayaquil',
        'America/Guyana',
        'America/Halifax',
        'America/Havana',
        'America/Hermosillo',
        'America/Indiana/Indianapolis',
        'America/Indiana/Knox',
        'America/Indiana/Marengo',
        'America/Indiana/Petersburg',
        'America/Indiana/Tell_City',
        'America/Indiana/Vevay',
        'America/Indiana/Vincennes',
        'America/Indiana/Winamac',
        'America/Inuvik',
        'America/Iqaluit',
        'America/Jamaica',
        'America/Juneau',
        'America/Kentucky/Louisville',
        'America/Kentucky/Monticello',
        'America/La_Paz',
        'America/Lima',
        'America/Los_Angeles',
        'America/Maceio',
        'America/Managua',
        'America/Manaus',
        'America/Martinique',
        'America/Matamoros',
        'America/Mazatlan',
        'America/Menominee',
        'America/Merida',
        'America/Metlakatla',
        'America/Mexico_City',
        'America/Miquelon',
        'America/Moncton',
        'America/Monterrey',
        'America/Montevideo',
        'America/Nassau',
        'America/New_York',
        'America/Nipigon',
        'America/Nome',
        'America/Noronha',
        'America/North_Dakota/Beulah',
        'America/North_Dakota/Center',
        'America/North_Dakota/New_Salem',
        'America/Ojinaga',
        'America/Panama',
        'America/Pangnirtung',
        'America/Paramaribo',
        'America/Phoenix',
        'America/Port-au-Prince',
        'America/Port_of_Spain',
        'America/Porto_Velho',
        'America/Puerto_Rico',
        'America/Punta_Arenas',
        'America/Rainy_River',
        'America/Rankin_Inlet',
        'America/Recife',
        'America/Regina',
        'America/Resolute',
        'America/Rio_Branco',
        'America/Santarem',
        'America/Santiago',
        'America/Santo_Domingo',
        'America/Sao_Paulo',
        'America/Scoresbysund',
        'America/Sitka',
        'America/St_Johns',
        'America/Swift_Current',
        'America/Tegucigalpa',
        'America/Thule',
        'America/Thunder_Bay',
        'America/Tijuana',
        'America/Toronto',
        'America/Vancouver',
        'America/Whitehorse',
        'America/Winnipeg',
        'America/Yakutat',
        'America/Yellowknife',
        'Antarctica/Casey',
        'Antarctica/Davis',
        'Antarctica/DumontDUrville',
        'Antarctica/Macquarie',
        'Antarctica/Mawson',
        'Antarctica/Palmer',
        'Antarctica/Rothera',
        'Antarctica/Syowa',
        'Antarctica/Troll',
        'Antarctica/Vostok',
        'Asia/Almaty',
        'Asia/Amman',
        'Asia/Anadyr',
        'Asia/Aqtau',
        'Asia/Aqtobe',
        'Asia/Ashgabat',
        'Asia/Atyrau',
        'Asia/Baghdad',
        'Asia/Baku',
        'Asia/Bangkok',
        'Asia/Barnaul',
        'Asia/Beirut',
        'Asia/Bishkek',
        'Asia/Brunei',
        'Asia/Chita',
        'Asia/Choibalsan',
        'Asia/Colombo',
        'Asia/Damascus',
        'Asia/Dhaka',
        'Asia/Dili',
        'Asia/Dubai',
        'Asia/Dushanbe',
        'Asia/Famagusta',
        'Asia/Gaza',
        'Asia/Hebron',
        'Asia/Ho_Chi_Minh',
        'Asia/Hong_Kong',
        'Asia/Hovd',
        'Asia/Irkutsk',
        'Asia/Jakarta',
        'Asia/Jayapura',
        'Asia/Jerusalem',
        'Asia/Kabul',
        'Asia/Kamchatka',
        'Asia/Karachi',
        'Asia/Kathmandu',
        'Asia/Khandyga',
        'Asia/Kolkata',
        'Asia/Krasnoyarsk',
        'Asia/Kuala_Lumpur',
        'Asia/Kuching',
        'Asia/Macau',
        'Asia/Magadan',
        'Asia/Makassar',
        'Asia/Manila',
        'Asia/Nicosia',
        'Asia/Novokuznetsk',
        'Asia/Novosibirsk',
        'Asia/Omsk',
        'Asia/Oral',
        'Asia/Pontianak',
        'Asia/Pyongyang',
        'Asia/Qatar',
        'Asia/Qostanay',
        'Asia/Qyzylorda',
        'Asia/Riyadh',
        'Asia/Sakhalin',
        'Asia/Samarkand',
        'Asia/Seoul',
        'Asia/Shanghai',
        'Asia/Singapore',
        'Asia/Srednekolymsk',
        'Asia/Taipei',
        'Asia/Tashkent',
        'Asia/Tbilisi',
        'Asia/Tehran',
        'Asia/Thimphu',
        'Asia/Tokyo',
        'Asia/Tomsk',
        'Asia/Ulaanbaatar',
        'Asia/Urumqi',
        'Asia/Ust-Nera',
        'Asia/Vladivostok',
        'Asia/Yakutsk',
        'Asia/Yangon',
        'Asia/Yekaterinburg',
        'Asia/Yerevan',
        'Atlantic/Azores',
        'Atlantic/Bermuda',
        'Atlantic/Canary',
        'Atlantic/Cape_Verde',
        'Atlantic/Faroe',
        'Atlantic/Madeira',
        'Atlantic/Reykjavik',
        'Atlantic/South_Georgia',
        'Atlantic/Stanley',
        'Australia/Adelaide',
        'Australia/Brisbane',
        'Australia/Broken_Hill',
        'Australia/Currie',
        'Australia/Darwin',
        'Australia/Eucla',
        'Australia/Hobart',
        'Australia/Lindeman',
        'Australia/Lord_Howe',
        'Australia/Melbourne',
        'Australia/Perth',
        'Australia/Sydney',
        'CET',
        'CST6CDT',
        'EET',
        'EST',
        'EST5EDT',
        'Etc/GMT',
        'Etc/GMT+1',
        'Etc/GMT+10',
        'Etc/GMT+11',
        'Etc/GMT+12',
        'Etc/GMT+2',
        'Etc/GMT+3',
        'Etc/GMT+4',
        'Etc/GMT+5',
        'Etc/GMT+6',
        'Etc/GMT+7',
        'Etc/GMT+8',
        'Etc/GMT+9',
        'Etc/GMT-1',
        'Etc/GMT-10',
        'Etc/GMT-11',
        'Etc/GMT-12',
        'Etc/GMT-13',
        'Etc/GMT-14',
        'Etc/GMT-2',
        'Etc/GMT-3',
        'Etc/GMT-4',
        'Etc/GMT-5',
        'Etc/GMT-6',
        'Etc/GMT-7',
        'Etc/GMT-8',
        'Etc/GMT-9',
        'Etc/UTC',
        'Europe/Amsterdam',
        'Europe/Andorra',
        'Europe/Astrakhan',
        'Europe/Athens',
        'Europe/Belgrade',
        'Europe/Berlin',
        'Europe/Brussels',
        'Europe/Bucharest',
        'Europe/Budapest',
        'Europe/Chisinau',
        'Europe/Copenhagen',
        'Europe/Dublin',
        'Europe/Gibraltar',
        'Europe/Helsinki',
        'Europe/Istanbul',
        'Europe/Kaliningrad',
        'Europe/Kiev',
        'Europe/Kirov',
        'Europe/Lisbon',
        'Europe/London',
        'Europe/Luxembourg',
        'Europe/Madrid',
        'Europe/Malta',
        'Europe/Minsk',
        'Europe/Monaco',
        'Europe/Moscow',
        'Europe/Oslo',
        'Europe/Paris',
        'Europe/Prague',
        'Europe/Riga',
        'Europe/Rome',
        'Europe/Samara',
        'Europe/Saratov',
        'Europe/Simferopol',
        'Europe/Sofia',
        'Europe/Stockholm',
        'Europe/Tallinn',
        'Europe/Tirane',
        'Europe/Ulyanovsk',
        'Europe/Uzhgorod',
        'Europe/Vienna',
        'Europe/Vilnius',
        'Europe/Volgograd',
        'Europe/Warsaw',
        'Europe/Zaporozhye',
        'Europe/Zurich',
        'HST',
        'Indian/Chagos',
        'Indian/Christmas',
        'Indian/Cocos',
        'Indian/Kerguelen',
        'Indian/Mahe',
        'Indian/Maldives',
        'Indian/Mauritius',
        'Indian/Reunion',
        'MET',
        'MST',
        'MST7MDT',
        'PST8PDT',
        'Pacific/Apia',
        'Pacific/Auckland',
        'Pacific/Bougainville',
        'Pacific/Chatham',
        'Pacific/Chuuk',
        'Pacific/Easter',
        'Pacific/Efate',
        'Pacific/Enderbury',
        'Pacific/Fakaofo',
        'Pacific/Fiji',
        'Pacific/Funafuti',
        'Pacific/Galapagos',
        'Pacific/Gambier',
        'Pacific/Guadalcanal',
        'Pacific/Guam',
        'Pacific/Honolulu',
        'Pacific/Kiritimati',
        'Pacific/Kosrae',
        'Pacific/Kwajalein',
        'Pacific/Majuro',
        'Pacific/Marquesas',
        'Pacific/Nauru',
        'Pacific/Niue',
        'Pacific/Norfolk',
        'Pacific/Noumea',
        'Pacific/Pago_Pago',
        'Pacific/Palau',
        'Pacific/Pitcairn',
        'Pacific/Pohnpei',
        'Pacific/Port_Moresby',
        'Pacific/Rarotonga',
        'Pacific/Tahiti',
        'Pacific/Tarawa',
        'Pacific/Tongatapu',
        'Pacific/Wake',
        'Pacific/Wallis',
        'WET'
    ];

    zones.forEach((cityName) => {
        getCityOffset(cityName);
    });
}