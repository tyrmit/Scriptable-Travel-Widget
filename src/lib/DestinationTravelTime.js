/**
 * @module DestinationTravelTime
 * @author Todd Hosey
 * @version 1.0
 * @license GNU General Public License, version 3
 * @exports getTravelTime function
 * @todo
 * <ul>
 * <li>Cope with no API key in keychain</li>
 * <li>Cope with no config file in data folder</li>
 * <li>Cope with no location in keychain</li>
 * </ul>
 */

const DEBUG = false;
const logger = DEBUG ? importModule('/lib/Logger').logger : null;

const apiKey = Keychain.get('MAPS_API_KEY');

/**
 * Returns JSON of a config file. The file is expected to be under the /data subfolder of the Scriptable folder in iCloud, and should be named DestinationTravelTime.config.json.
 * @async
 * @returns A promise that resolves to a JSON object of the parsed string from the config.json file
 */
async function getConfig() {
    if (DEBUG) logger.pushFunction('getConfig', 'getTravelTime');

    const fm = FileManager.iCloud();
    const dataPath = fm.joinPath(fm.documentsDirectory(), 'data');
    const dataFile = fm.joinPath(dataPath, 'DestinationTravelTime.config.json');
    if (DEBUG) logger.writeToLogFile('Config file is ' + dataFile, 'getConfig');

    if (!fm.isFileDownloaded(dataFile)) {
        await fm.downloadFileFromiCloud(dataFile);
        if (DEBUG)
            logger.writeToLogFile(
                dataFile + ' downloaded from iCloud',
                'getConfig'
            );
    }
    const content = fm.readString(dataFile);

    if (DEBUG) {
        logger.writeToLogFile(
            'content from data file has been read',
            'getConfig'
        );
        logger.popFunction('getConfig');
    }

    return JSON.parse(content);
}

/**
 * Replaces 'fancy quotes' (“”, ‘’) with standard quote characters (", ') in the given string. This is needed if a JSON string is stored in a format that uses the fancy quotes,
 * such as in the Notes section of a calendar event, as JSON.parse cannot parse the fancy quotes. Is now deprecated as we store the JSON configuration in a JSON file now,
 * rather than in individual calendar events.
 * @deprecated
 * @param {string} origText The string in which 'fancy quotes' appear and are to be replaced
 * @returns Updated string with the 'fancy quotes' replaced by standard quote characters.
 */
function replaceFancyQuotes(origText) {
    return origText
        .replaceAll('“', '"')
        .replaceAll('”', '"')
        .replaceAll('‘', "'")
        .replaceAll('’', "'");
}

/**
 * Gets the next event in the specified calendar.
 * @async
 * @param {string} calendarName The name of the calendar to retrieve events from
 * @returns A Promise resolving to the nextEvent object, which contains all the detail of the next event from the specified calendar
 */
async function getNextEvent(calendarName) {
    if (DEBUG) logger.pushFunction('getNextEvent', 'getTravelTime');

    const destinationCalendar = await Calendar.forEventsByTitle(calendarName);
    const destinationEvents = await CalendarEvent.today([destinationCalendar]);

    if (DEBUG)
        logger.writeToLogFile(
            'Retrieved calendar events for today',
            'getNextEvent'
        );

    const endOfTheDay = new Date();
    endOfTheDay.setHours(0);
    endOfTheDay.setMinutes(0);
    endOfTheDay.setSeconds(0);
    endOfTheDay.setMilliseconds(0);
    endOfTheDay.setDate(endOfTheDay.getDate() + 1);

    if (DEBUG)
        logger.writeToLogFile(
            'endOfTheDay date set to ' + endOfTheDay,
            'getNextEvent'
        );

    const now = new Date();

    let nextEvent = {
        title: 'none',
        location: null,
        time: endOfTheDay,
        options: {},
    };

    for (const ev of destinationEvents) {
        // Check for the following:
        // - the start time of the event is in the future
        // - the start time is closer than the nextEvent
        // - the start time is closer than 2 hours away
        // - the event has a location specified
        if (
            ev.startDate > now &&
            ev.startDate < nextEvent.time &&
            (ev.startDate - now) / 60 / 1000 <= 120 &&
            ev.location?.length > 0
        ) {
            nextEvent = {
                title: ev.title,
                location: ev.location
                    .replaceAll(/[ \n]/gi, '+')
                    .replaceAll(/,/gi, '')
                    .replaceAll(/–/gi, '-'),
                time: ev.startDate,
            };
        }
    }

    if (DEBUG) {
        logger.writeToLogFile(
            'nextEvent object determined: ' + JSON.stringify(nextEvent),
            'getNextEvent'
        );
        logger.popFunction('getNextEvent');
    }

    return nextEvent;
}

/**
 * Gets the current location of the device and saves it to the Keychain (key: "LAST_LOC_LAT_LONG"). If retrieving the current location fails, it will seek to return the last
 * known location that is stored in the Keychain.
 * <p>
 * When attempting to retrieve the current location from the device, it will set the accuracy to within 100m. Best accuracy takes up to 10s to compute, while at 100m it is less
 * than a second. This is deemed to be the greatest balance between speed and accuracy.
 * </p>
 * @async
 * @returns A Promise resolving to the myLocation object, which contains the detail from the device on the current location.
 */
async function getCurrentLocation() {
    if (DEBUG) logger.pushFunction('getCurrentLocation', 'getTravelTime');

    // Setting accuracy to a hundred meters is the best balance of accuracy and speed. Anything more accurate takes too long.
    Location.setAccuracyToHundredMeters();
    let myLocation = null;
    try {
        myLocation = await Location.current();
        if (DEBUG)
            logger.writeToLogFile(
                'Location retrieved: ' + JSON.stringify(myLocation),
                'getCurrentLocation'
            );
    } catch (err) {
        if (DEBUG) logger.writeToLogFile(err, 'getCurrentLocation', 'ERROR');
    }

    if (!myLocation?.latitude || !myLocation?.longitude) {
        if (DEBUG)
            logger.writeToLogFile(
                'Could not retrieve location from device, so looking for it in the keychain',
                'getCurrentLocation'
            );
        myLocation = JSON.parse(Keychain.get('LAST_LOC_LAT_LONG'));
        if (DEBUG)
            logger.writeToLogFile(
                'Location retrieved from keychain: ' +
                    JSON.stringify(myLocation),
                'getCurrentLocation'
            );
    } else {
        if (DEBUG)
            logger.writeToLogFile(
                'Recording location in keychain',
                'getCurrentLocation'
            );
        Keychain.set('LAST_LOC_LAT_LONG', JSON.stringify(myLocation));
    }

    if (DEBUG) {
        logger.writeToLogFile(
            'Returning location: ' + JSON.stringify(myLocation),
            'getCurrentLocation'
        );
        logger.popFunction('getCurrentLocation');
    }

    return myLocation;
}

/**
 * Returns all possible routes for the destination returned from the Google Directions Web API.
 * @async
 * @param {string} apiKey The Google Maps Directions API key
 * @param {Object} myLocation Location data. The <code>longitude</code> and <code>latitude</code> values are passed to the Google Maps API as the starting location for the route.
 * @param {string} destination The string representation of the location of the event to travel to. Is passed to the Google API as the destination for the route.
 * @returns A Promise that resolves to an Array of possibleRoute objects. If an error occurs, the array will contain only one object in the array and that object will have an error key/value which describes the
 * error.
 */
async function getPossibleRoutes(apiKey, myLocation, destination) {
    if (DEBUG) {
        logger.pushFunction('getPossibleRoutes', 'getTravelTime');
        logger.writeToLogFile(
            'Calling Google Maps API to retrieve directions info',
            'getPossibleRoutes'
        );
    }

    const mapsUrl = `https://maps.googleapis.com/maps/api/directions/json?key=${apiKey}&origin=${myLocation.latitude},${myLocation.longitude}&destination=${destination}&alternatives=true&departure_time=now&traffic_model=pessimistic`;
    if (DEBUG)
        logger.writeToLogFile(
            "Maps URL = '" + mapsUrl + "'",
            'getPossibleRoutes'
        );

    const mapsReq = new Request(mapsUrl);
    const mapsResult = await mapsReq.loadJSON();

    if (mapsResult?.status !== 'OK') {
        if (DEBUG) {
            logger.writeToLogFile(
                mapsResult?.status,
                'getPossibleRoutes',
                'ERROR'
            );
            logger.writeToLogFile(
                mapsResult?.error_message,
                'getPossibleRoutes',
                'ERROR'
            );
        }

        return [
            {
                name: 'Maps API error',
                status: mapsResult?.status,
                error: mapsResult?.error_message,
            },
        ];
    }

    const possibleRoutes = mapsResult.routes
        .map((route) => {
            return {
                name: route.summary,
                travelTime: route.legs[0].duration_in_traffic.value,
            };
        })
        .sort((route1, route2) => {
            // Note: this will sort in descending order with the greatest travel time first
            if (route1.travelTime < route2.travelTime) {
                return 1;
            } else if (route1.travelTime > route2.travelTime) {
                return -1;
            } else {
                return 0;
            }
        });

    if (DEBUG) {
        logger.writeToLogFile(
            'Returning possibleRoutes: ' + JSON.stringify(possibleRoutes),
            'getPossibleRoutes'
        );
        logger.popFunction('getPossibleRoutes');
    }

    return possibleRoutes;
}

/**
 * Chooses a route from possibleRoutes array and returns it. Will first check whether the destination is a known place (is contained in the knownPlaces array).
 * If not, will return the route with the greatest travel time, which is the first in the possibleRoutes array since it is sorted by greatest to least travel time.
 * @param {Array} possibleRoutes Array of possibleRoute objects.
 * @param {Array} knownPlaces Array of known places that were pulled from the config.json file.
 * @param {string} destination The destination string that was passed to the Google Maps Directions API.
 * @returns chosenRoute object, which has details of the route that was chosen.
 */
function getChosenRoute(possibleRoutes, knownPlaces, destination) {
    if (DEBUG) logger.pushFunction('getChosenRoute', 'getTravelTime');

    let chosenRoute = null;
    const knownPlace = knownPlaces.find((place) =>
        place.location_names.includes(destination)
    );

    if (knownPlace) {
        if (DEBUG)
            logger.writeToLogFile(
                destination +
                    " is a known place. Let's see if there's a matching preferred route...",
                'getChosenRoute'
            );

        chosenRoute = possibleRoutes.find((route) =>
            knownPlace.preferred_routes.includes(route.name)
        );
    }

    // If we still don't have a chosen route here, set it to the first in the possibleRoutes array (will be the route with the longest travel time)
    if (!chosenRoute) {
        if (DEBUG)
            logger.writeToLogFile(
                'No preferred route found, so taking the route with the highest travel time',
                'getChosenRoute'
            );

        chosenRoute = possibleRoutes[0];
    } else {
        if (DEBUG)
            logger.writeToLogFile(
                'Preferred route is ' + chosenRoute.name,
                'getChosenRoute'
            );
    }

    if (DEBUG) logger.popFunction('getChosenRoute');
    return chosenRoute;
}

/**
 * Main function of the module and the one that is exported. Performs the following:
 * <ul>
 * <li>Retrieves the current location</li>
 * <li>Retrieves the next event in the specified calendar</li>
 * <li>Retrieves the config from the config.json file in the iCloud Scriptable folder, /data subfolder</li>
 * <li>Calls getPossibleRoutes to retrieve routes for the destination in the next event</li>
 * <li>Calls getChosenRoute to choose the route that will be used</li>
 * <li>Calculates the final travel time and arrival time, and returns the routeInfo object</li
 * </ul>
 *
 * @param {boolean} bePessimistic A boolean value that specifies whether the returned travel time should add a buffer (20% of the travel time or 10 mins, whichever is greater).
 * @param {string}  calendarName The name of the iCloud calendar to check for the next event. Defaults to the 'Travel Destinations' calendar.
 * @returns A promise that resolves to the routeInfo for the next event in the calendar
 */
async function getTravelTime(
    bePessimistic = false,
    calendarName = 'Travel Destinations'
) {
    if (DEBUG) {
        await logger.openLogFile('DestinationTravelTime.log', false);
        logger.pushFunction('getTravelTime');
        logger.writeToLogFile('API key from keychain retrieved: ' + apiKey);
    }

    const configPromise = getConfig();
    const nextEvent = await getNextEvent(calendarName);

    if (nextEvent.title === 'none') {
        if (DEBUG)
            logger.writeToLogFile(
                'Nowhere to go for the rest of the day',
                'getTravelTime'
            );

        return {
            routeName: 'none',
            routeTimeSeconds: 0,
            destinationName: 'No where to go...',
        };
    }

    const myLocation = await getCurrentLocation();
    const possibleRoutes = await getPossibleRoutes(
        apiKey,
        myLocation,
        nextEvent.location
    );

    if (possibleRoutes[0].error) {
        if (DEBUG)
            logger.writeToLogFile(
                `Google maps returned status ${possibleRoutes[0].status} - "${possibleRoutes[0].error}"`,
                'getTravelTime',
                'ERROR'
            );

        return {
            routeName: 'none',
            routeTimeSeconds: 0,
            destinationName: 'Maps API error',
        };
    }

    if (DEBUG)
        logger.writeToLogFile(
            'possibleRoutes = ' + JSON.stringify(possibleRoutes),
            'getTravelTime'
        );

    // If there is a preferred route set in the config, try to use that for the chosen route
    const config = await configPromise;
    const chosenRoute = getChosenRoute(possibleRoutes, config.known_places);

    if (DEBUG)
        logger.writeToLogFile(
            `Travel time to ${nextEvent.title} is ${Math.ceil(
                chosenRoute.travelTime / 60
            )} minutes using ${chosenRoute.name}`,
            'getTravelTime'
        );

    let finalTravelTime = chosenRoute.travelTime;
    if (bePessimistic) {
        // Add 20% or 10 mins to the travel time, whichever is greater
        finalTravelTime += Math.max(Math.ceil(finalTravelTime * 0.2), 600);
    }

    const arrivalTime = new Date();
    arrivalTime.setTime(arrivalTime.getTime() + finalTravelTime * 1000);

    const returnObj = {
        routeName: chosenRoute.name,
        routeTimeSeconds: finalTravelTime,
        destinationName: nextEvent.title,
        arrivalTargetTime: nextEvent.time,
        arrivalTime: arrivalTime,
    };

    if (DEBUG) {
        logger.writeToLogFile(
            'returning the following object from DestinationTravelTime.getTravelTime()',
            'getTravelTime'
        );
        logger.writeToLogFile(JSON.stringify(returnObj), 'getTravelTime');
        logger.popFunction('getTravelTime');
        logger.closeLogFile();
    }

    return returnObj;
}

module.exports.getTravelTime = getTravelTime;
