# Scriptable-Travel-Widget
A script for the iOS app Scriptable to be used in a widget on the home screen. The widget will pull the next event from a designated calendar, and check the travel time between the current location and the location in the calendar event using the Google Maps Directions Web API. The travel time will be displayed in the widget and will factor in current traffic as well as adding a buffer for good measure. The widget will also set notifications to display 10 minutes before the time to leave, and again when it is time to leave in order to arrive by the calendar event start time.

## Prerequisites
Prerequisites for using this script:
1. Install the Scriptable app from the App Store if you haven't already :)
2. Enable iCloud drive
3. Create a Google Maps API key for the Directions API
4. Enter the API key in Keychain (refer below for more detail)
5. Set up a 'Travel Destinations' iCloud calendar - this is the calendar that will be checked for events

## Entering the Maps API in Keychain
The simplest way to do this is to open the scriptable app and create a new script, enter the following code and run:
`Keychain.set('MAPS_API_KEY', 'your API key goes here');`

Note that the Keychain key must be 'MAPS_API_KEY', that's what the widget will look for.

## Installing the Widget Scripts
Download the files and folders in the `/src` folder and copy them to the Scriptable iCloud folder. If done correctly you should see the Travel Widget script in the Scriptable app.

Once the script is good to go, create a new Scriptable widget on your home screen and point it at the Travel Widget script. Set the 'When Interacting' action to 'Run Script' so you can make the widget update on demand when you tap the widget.

### Important Note About API Cost
This widget uses the **Google Maps API**, which incurs a cost of around 1c per API call. Google does provide a $200 monthly credit to offset low usage so there is nothing to pay provided costs do not exceed this $200 credit threshold. This effectively gives you 20,000 API calls for free each month.

The widget calls the API once each time it refreshes, provided there is an event that it is actively monitoring. The widget only monitors one event at a time, being the one that is the next earliest event.

A number of measures have been implemented to keep API calls to a minimum:
- The widget will only pick up a calendar event that is within the next 2 hours. If an event is more than 2 hours in the future, the widget will ignore it until it is within that 2 hour window.
- The widget will refresh no more than every 5 minutes. How often a widget refreshes is largely up to iOS, and the device may opt to refresh the widget less often depending on various factors, but it will not be more often than every 5 minutes.
- The widget will not start to refresh every 5 minutes until there is double the travel time before the event start time.
 
For example, if you have an event starting at 3pm and it will take ~20 mins to get there, the widget will pick up the event at 1pm and see that the travel time is 20 mins, and then not refresh again until 2:20pm (40 mins before the start time). It will then start to refresh every 5 minutes until 3pm. We therefore have 10 API calls, costing 10c. If a destination would take 1 hour or longer to travel to, then it may incur the maximum cost of 24c by refreshing every 5 minutes for the full 2 hour window. Obviously if you tap the widget to manually refresh it that will incur additional API call charges.

As always, please ensure you fully understand and accept the terms of using Google's APIs and Cloud Platform before activating and using them.

### Configuring Known Places
You can specify known places and the preferred routes to them in the `/data/DestinationTravelTime.config.json` file. There is an example file already in the repository. If the destination of a calendar event isn't recognised as a known place from this file, the route with the greatest travel time is chosen instead.
