/**
 * @module Logger.js
 * @author Todd Hosey
 * @version 1.0
 * @license GNU General Public License, version 3
 * @exports logger object
 *
 */
'use strict';

const kIndentString = '   ';

const defaultFunctionInfo = { name: '', indentLevel: 0, caller: '' };

const logger = (() => {
    let logFileContent = '';
    let fileOpen = false;
    let logFilePath = '';
    let functionStack = [{ ...defaultFunctionInfo }];

    const fm = FileManager.iCloud();

    /**
     * @private
     *
     * Returns the file path of the logs folder in the Scriptable documents directory in iCloud
     * @returns {string} The path to the logs folder
     */
    const getLogsFolder = () => {
        const logsPath = fm.joinPath(fm.documentsDirectory(), 'logs');

        if (!fm.fileExists(logsPath)) {
            fm.createDirectory(logsPath);
        }

        return logsPath;
    };

    /**
     * @private
     *
     * Writes the given logContent to the open log file using the provided functionInfo to output both the function context and the indent level for the function
     * @param {string} logContent The content that needs to be added to the log file
     * @param {Object} functionInfo Representation of a function and how it should be displayed in the log: <code>{name: string, indentLevel: number, caller: string}</code>
     */
    const writeToLogFileWithFunctionInfo = (
        logContent,
        functionInfo,
        contentType = 'INFO'
    ) => {
        const now = new Date();

        const formattedDate =
            now.toLocaleDateString('en-AU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            }) +
            ' ' +
            now.toLocaleTimeString('en-AU', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });

        const stringToWrite =
            formattedDate +
            '\t' +
            contentType.padEnd(5, ' ').substring(0, 5) +
            '\t' +
            functionInfo.name.padEnd(25, ' ') +
            '\t' +
            logContent.padStart(
                logContent.length + functionInfo.indentLevel,
                kIndentString
            ) +
            '\n';

        logFileContent += stringToWrite;
        fm.writeString(logFilePath, logFileContent);
    };

    /**
     * @public
     * @async
     *
     * 'Opens' the log file. The scriptable FileManager interface doesn't actually keep files open, but this function will determine whether it already exists and if it does,
     * ensure it is downloaded and ready to use. If the file exists but startNew is True, then the existing file will be deleted - the new file will not be created until it
     * is first written to, however. This function must be called first before writeToLogFile.
     * @param {string} fileName The name of the log file
     * @param {boolean} startNew Indicates whether to start the file new if True, or append to an existing file if False
     */
    const openLogFile = async (fileName, startNew = false) => {
        const logsPath = getLogsFolder();
        logFilePath = fm.joinPath(logsPath, fileName);

        if (fm.fileExists(logFilePath)) {
            if (startNew) {
                fm.remove(logFilePath);
            } else {
                if (!fm.isFileDownloaded(logFilePath)) {
                    await fm.downloadFileFromiCloud(logFilePath);
                }

                logFileContent = fm.readString(logFilePath);
            }
        }

        fileOpen = true;
        writeToLogFile('***** START OF LOG *****');
    };

    /**
     * Finds the function info based on the provided functionName, and then calls private method writeToLogFileWithFunctionInfo. If function info
     * isn't found in the functionStack, it passes the default function info instead.
     *
     * @param {string} logContent The content to be appended to the log file
     * @param {string} functionName The name of the function context
     * @param {string} contentType "INFO", "WARN", or "ERROR"
     */
    const writeToLogFile = (
        logContent,
        functionName = '',
        contentType = 'INFO'
    ) => {
        if (fileOpen) {
            const functionInfo = functionStack.find(
                (el) => el.name === functionName
            ) || { ...defaultFunctionInfo };

            writeToLogFileWithFunctionInfo(
                logContent,
                functionInfo,
                contentType
            );
        } else {
            throw 'Logger.js error: Log file must be opened via openFile before writeToLogFile can be called';
        }
    };

    /**
     * Pushes a new function to the function stack. Will determine the indentLevel for this function based on the indentLevel of the
     * calling function, fromFunction.
     *
     * @param {string} functionName Name of the function being pushed to the function stack
     * @param {string} fromFunction Name of the calling function
     */
    const pushFunction = (functionName, fromFunction = '') => {
        const fromFxnInfo = functionStack.find(
            (el) => el.name === fromFunction
        ) || { ...defaultFunctionInfo };

        if (!functionStack.find((el) => el.name === functionName)) {
            functionStack.push({
                name: functionName,
                indentLevel: fromFxnInfo.indentLevel + 1,
                caller: fromFunction,
            });
        }

        writeToLogFileWithFunctionInfo('CALL: ' + functionName, fromFxnInfo);
    };

    /**
     * Pops a function from the function stack. Reference to 'popping' an element from a stack is a carry-over from when the
     * functionStack behaved more like a stack structure and the last added item was removed. Now it finds and removes the
     * function indicated by functionName, regardless of it's position in the stack.
     *
     * @param {string} functionName The name of the function to remove/pop from the functionStack
     */
    const popFunction = (functionName = 'Null') => {
        // checking for length > 1 since we expect the 0th element should always be in the array
        if (functionStack.length > 1) {
            const functionIndex = functionStack.findIndex(
                (el) => el.name === functionName
            );

            // checking for index > 0, since the 0th element shouldn't be removed
            if (functionIndex > 0) {
                writeToLogFile(
                    'END: ' + functionName,
                    functionStack[functionIndex].caller
                );

                functionStack.splice(functionIndex, 1);
            } else {
                writeToLogFileWithFunctionInfo(
                    `Can't delete '${functionName} from the function stack`,
                    { ...defaultFunctionInfo }
                );
            }
        }
    };

    /**
     * Writes the 'END OF LOG' string to the file and flags the file as closed. Should only be called at the end when no further
     * content is expected to be written to the file. Once this method is called, no further content can be written to the file
     * unless openLogFile is called again.
     *
     */
    const closeLogFile = () => {
        if (fileOpen) {
            writeToLogFile('***** END OF LOG *****\n\n');
            fileOpen = false;
        }
    };

    return {
        openLogFile: openLogFile,
        writeToLogFile: writeToLogFile,
        pushFunction: pushFunction,
        popFunction: popFunction,
        closeLogFile: closeLogFile,
    };
})();

module.exports.logger = logger;
