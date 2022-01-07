// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: car-side;
/**
 * @author Todd Hosey
 * @version 1.0
 * @copyright GNU General Public License, version 3
 * @exports getTravelTime function
 * @todo
 * -    Find cause of kCLerror 1 in widget
 */

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

// ----------------------------------------------------------
// FUNCTION TO ADD A NOTIFICATION WHEN IT'S TIME TO LEAVE
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

// ----------------------------------------------------------
// DO AS MUCH AS WE CAN TO SET UP THE WIDGET IN PARALLEL TO THE routeInfoPromise RUNNING
const padding = 4;

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
mainMinStack.setPadding(0, 0, 15, 0);

const subStack = widget.addStack();

// ----------------------------------------------------------
// NOW WAIT FOR THE ROUTEINFO
const routeInfo = await routeInfoPromise;
console.log(JSON.stringify(routeInfo));

// ----------------------------------------------------------
// USE THE routeInfo TO SET THE NOTIFICATION

// Calculate the notification trigger time. If the trigger time is more than 10 minutes away, set the time to 10 minutes before
// The notification message is also dependent on the trigger time ('get ready to leave' VS 'leave now')
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

// ----------------------------------------------------------
// USE THE routeInfo TO FINISH THE WIDGET

const routeTimeMinutes = Math.ceil(routeInfo.routeTimeSeconds / 60);

const headerText = headerStack.addText(routeInfo.destinationName);
headerText.font = Font.mediumSystemFont(16);

const mainText = mainNumberStack.addText(
    routeTimeMinutes.toString().padStart(2, '0')
);
mainText.font = Font.mediumSystemFont(72);

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

// ----------------------------------------------------------
// SET WIDGET REFRESH TIME TO NO EARLIER THAN THE DUE TIME LESS DOUBLE THE TRAVEL TIME, OR IF THAT'S LESS THAN THE CURRENT TIME THEN IN 5 MINS
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
