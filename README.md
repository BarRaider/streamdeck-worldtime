# World Time clock for Elgato Stream Deck

Displays the local time in cities around the world.
Supports both Windows and Mac

**Author's website and contact information:** [https://barraider.com](https://barraider.com)

## New in v1.9
- Added an option to show the time with seconds

## New in v1.8
- Built-In time zone calculation. Removes the need for an external API. "`Server Error`" issues should now be resolved.

## New in v1.7
- Improved CPU usage
- Fixed issue where time was not copied correctly to clipboard when pressing the button

## New in v1.6
- Added support for time zones that are not whole hours (Such as: `Australia/Adelaide`)
- Clock can now be customizable to 4 different modes (24hr/AMPM/Hide AMPM/Hide Clock)
- Date can now be customizable to 3 different modes (ddmm/mmdd/Hide Date)
- Font Size and Color can now be customizable

## Features
- Date support - shows the current date in the chosen city/timezone
- Pressing the key will copy the current date and time in the chosen city/timezone to the clipboard
- Ability to choose between dd/mm and mm/dd date formats
- Choose a customized title to show instead of the City name
- Support for both AM/PM and 24-hour clock

### Download

* [Download plugin](https://github.com/BarRaider/streamdeck-worldtime/releases)

## I found a bug, who do I contact?
For support please contact the developer. Contact information is available at https://barraider.com

## I have a feature request, who do I contact?
Please contact the developer. Contact information is available at https://barraider.com

## Dependencies
* Uses StreamDeck-Tools by BarRaider: [![NuGet](https://img.shields.io/nuget/v/streamdeck-tools.svg?style=flat)](https://www.nuget.org/packages/streamdeck-tools)
* Uses [Easy-PI](https://github.com/BarRaider/streamdeck-easypi) by BarRaider - Provides seamless integration with the Stream Deck PI (Property Inspector) 
