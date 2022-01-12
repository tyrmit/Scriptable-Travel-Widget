// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: car-side;
/**
 * @author Todd Hosey
 * @license GNU General Public License, version 3
 * @exports getTravelTime function
 *
 */
'use strict';

let routeModule = null;
try {
    routeModule = importModule('/lib/DestinationTravelTime');
} catch (err) {
    console.error(err);
}

if (!routeModule) {
    console.log('No routeModule, exiting');
    return;
}

const routeInfoPromise = routeModule.getTravelTime(true);

/**
 * Uses the title, message and triggerTimeSeconds to schedule a notification. If a pending notification with
 * the same title already exists, it will update that notification rather than create a new one.
 * @param {string} title The title of the notification
 * @param {string} message The message body of the notification
 * @param {number} triggerTimeSeconds Date/time in seconds since the UNIX epoch for the notification to trigger
 */
async function addUpdateNotification(title, message, triggerTimeSeconds) {
    const triggerTime = new Date();
    triggerTime.setTime(triggerTimeSeconds);

    console.log(
        `addUpdateNotification('${title}'): function called with:\n\ttitle = '${title}'\n\tmessage = '${message}'\n\ttriggerTime = ${triggerTime}`
    );

    // Notification trigger time needs to be more than 30 seconds in the future before we do anything
    if (triggerTime > Date.now() + 30 * 1000) {
        console.log(
            `addUpdateNotification('${title}'): triggerTime ${triggerTime} is greater than ${
                Date.now() + 30 * 1000
            }, thus proceeding`
        );

        const notifications = await Notification.allPending();
        const currentNotification = notifications.find(
            (notif) => notif.title === title
        );
        if (currentNotification) {
            console.log(
                `addUpdateNotification('${title}'): notification with title '${title}' already exists:\n\tmessage = '${currentNotification.body}'\n\ttriggerTime = ${currentNotification.nextTriggerDate}`
            );
            console.log(
                `addUpdateNotification('${title}'): updating existing notification '${title}' with:\n\tmessage = '${message}'\n\ttriggerTime = ${triggerTime}`
            );

            currentNotification.setTriggerDate(triggerTime);
            currentNotification.body = message;
            currentNotification.schedule();
        } else {
            console.log(
                `addUpdateNotification('${title}'): no current notification, so need to set one:\n\ttitle = '${title}'\n\tmessage = '${message}'\n\ttriggerTime = ${triggerTime}`
            );
            const notif = new Notification();
            notif.title = title;
            notif.body = message;
            notif.setTriggerDate(triggerTime);
            notif.sound = 'default';
            notif.schedule();
        }
        return currentNotification;
    } else {
        console.log(
            `addUpdateNotification('${title}'): triggerTime ${triggerTime} is NOT greater than ${
                Date.now() + 30 * 1000
            }, thus doing nothing`
        );
    }
}

// Start setting up the widget here before we need the routeInfo
const padding = 8;

const widget = new ListWidget();
widget.setPadding(padding, padding, padding, padding);

const headerStack = widget.addStack();

const mainRowStack = widget.addStack();
mainRowStack.layoutHorizontally();
mainRowStack.bottomAlignContent();

const mainNumberStack = mainRowStack.addStack();
mainNumberStack.bottomAlignContent();

const mainMinStack = mainRowStack.addStack();
mainMinStack.bottomAlignContent();
mainMinStack.setPadding(0, 0, 12, 0);

const subStack = widget.addStack();

// Now wait for the routeInfo
const routeInfo = await routeInfoPromise;
console.log(JSON.stringify(routeInfo));

// Calculate the notification trigger time amd set the notification. If the trigger time is more than 10 minutes away, also set a notification 10 mins before
if (routeInfo.arrivalTargetTime) {
    const notificationTriggerTime = new Date();
    let notificationTitle = 'Leave Now';
    let notificationMessage = 'Leave NOW to ' + routeInfo.destinationName;
    notificationTriggerTime.setTime(
        routeInfo.arrivalTargetTime.getTime() -
            routeInfo.routeTimeSeconds * 1000
    );
    addUpdateNotification(
        notificationTitle,
        notificationMessage,
        notificationTriggerTime.getTime()
    );

    if (notificationTriggerTime > Date.now() - 10 * 60 * 1000) {
        notificationTriggerTime.setMinutes(
            notificationTriggerTime.getMinutes() - 10
        );
        notificationMessage =
            'Get ready to leave to ' + routeInfo.destinationName;
        notificationTitle = 'Get Ready To Leave';
        addUpdateNotification(
            notificationTitle,
            notificationMessage,
            notificationTriggerTime.getTime()
        );
    }
}

// Finish the widget with the routeInfo
const routeTimeMinutes = Math.ceil(routeInfo.routeTimeSeconds / 60);

const headerText = headerStack.addText(routeInfo.destinationName);
headerText.font = Font.mediumSystemFont(16);

const mainText = mainNumberStack.addText(
    routeTimeMinutes.toString().padStart(2, '0')
);
mainText.font = Font.mediumSystemFont(64);

if (routeInfo.arrivalTime && routeInfo.arrivalTargetTime) {
    const textColor =
        routeInfo.arrivalTime.setTime(
            routeInfo.arrivalTime.getTime() + 600000
        ) > routeInfo.arrivalTargetTime
            ? Color.red()
            : Color.green();
    mainText.textColor = textColor;
}

const minText = mainMinStack.addText(' mins');
minText.font = Font.mediumSystemFont(24);

const subText = subStack.addText(`Using ${routeInfo.routeName}`);
subText.font = Font.mediumSystemFont(12);

// Set the widget refresh time for no earlier than the due time less travel time x 2. If that's less than the current time, set tefresh time for no earlier than 5 mins from now instead.
const refreshTime = new Date();
if (routeInfo.arrivalTime && routeInfo.arrivalTargetTime) {
    refreshTime.setTime(
        routeInfo.arrivalTargetTime.getTime() -
            routeInfo.routeTimeSeconds * 2 * 1000
    );
}
if (refreshTime.getTime() < Date.now() + 5 * 60 * 1000) {
    refreshTime.setTime(Date.now());
    refreshTime.setMinutes(refreshTime.getMinutes() + 5);
}
console.log('setting widget.refreshAfterDate to ' + refreshTime);
widget.refreshAfterDate = refreshTime;

Script.setWidget(widget);
// widget.presentSmall();
Script.complete();
