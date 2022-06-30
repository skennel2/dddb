import express from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import http from 'http';
import * as io from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { v4 as uuidv4 } from 'uuid';
import FileSystemManager from './FileSystemManager';

interface IConnectSetup {
    host: string,
    port: number,
    name: string,
    password: string,
    flushInterval?: number,
}

interface IDataLogRecord {
    id: string,
    key: string,
    value: any,
    created: Date,
    status: 'add' | 'modify' | 'delete',
    clientId: string,
    accountId: string,
}

interface IDdDbServer {
    start: (setup: IConnectSetup) => {
        getServerStatus: () => ServerStatus
    }
}

enum ServerStatus {
    RUNNING, STOP
}

export default class DdDbServer implements IDdDbServer {

    private ioServer: io.Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any> | null = null;
    private httpServer: http.Server | null = null;

    private fsManager: FileSystemManager;

    private connectionLog: {
        clientId: string,
        created: Date;
        type: 'connected' | 'disconnected'
    }[] = [];

    private queryLogQueue: IDataLogRecord[] = [];
    private subQueryLogQueue: IDataLogRecord[] = [];

    private dataFlushing: boolean = false;
    private dataCompacting: boolean = false;

    private readonly RESOURCE_ROOT_PATH = 'resource/';
    private readonly FILE_RESOURCE_FILE_NAME = 'file_resource.log';
    private readonly LOG_ROOT_PATH = 'log/';
    private readonly LOG_FILE_BASE_NAME = 'datalog';

    private fastLookupRecordCache: FastLookUpCache = new FastLookUpCache();

    private dataLogFileList: {
        fileName: string,
        version: number,
        active: boolean,
    }[] = [];

    constructor() {
        let app = express();
        this.httpServer = http.createServer(app);

        this.ioServer = new io.Server(this.httpServer);

        this.fsManager = new FileSystemManager();
    }

    start = (setup: IConnectSetup) => {
        this.setUp(setup).then(() => {
            this.processStart(setup)
        })

        return {
            getServerStatus: () => {
                return ServerStatus.RUNNING;
            }
        }
    }

    private setUp = async (setup: IConnectSetup) => {
        const dataLogFileNames = (await fsp.readdir(this.LOG_ROOT_PATH))
            .filter(dataLogFileName => this.isDataLogFile(dataLogFileName));

        const fileResourcePathAndName
            = this.RESOURCE_ROOT_PATH + this.FILE_RESOURCE_FILE_NAME

        if (await this.fsManager.isFileExists(fileResourcePathAndName)) {
            const fileResourceFile = await fsp.readFile(fileResourcePathAndName, 'utf-8');

            const fileResourceJsonList = fileResourceFile
                .split('\n')
                .filter(line => line && line.length > 0)
                .map(line => JSON.parse(line));

            if (dataLogFileNames.length !== fileResourceJsonList.length) {
                throw new Error('file resource not sync data log');
            }

            this.dataLogFileList = fileResourceJsonList;
        } else {
            if (dataLogFileNames.length > 0) {
                throw new Error('file resource not sync data log');
            }

            await fsp.writeFile(fileResourcePathAndName, '');
        }
    }

    private isDataLogFile(fileName: string) {
        return fileName.startsWith(this.LOG_FILE_BASE_NAME) && fileName.endsWith('.log');
    }

    private processStart = (setup: IConnectSetup) => {
        if (!this.httpServer || !this.ioServer) {
            throw new Error('HTTP Server Cannot Started');
        }

        setInterval(async () => {
            await this.flush();
        }, setup.flushInterval !== undefined ? setup.flushInterval : 500);

        // setInterval(async () => {
        //     await this.compactLogFile();
        // }, 50000)

        this.httpServer.listen(setup.port, () => {
            this.log('listen ' + setup.port)
        })

        this.ioServer.on('connection', (socket) => {
            this.log('new client connected', socket.id);

            this.connectionLog.push({
                clientId: socket.id,
                created: new Date(),
                type: "connected"
            })

            socket.on('query', (args) => {
                this.log('request -> ' + args)
                try {
                    const argsObject = this.parseClientQueryRequestArgument(args);
                    if (argsObject && argsObject.key) {
                        if (argsObject.type === 'add') {
                            const newItem = {
                                id: uuidv4(),
                                status: 'add',
                                key: argsObject.key,
                                value: argsObject.payload,
                                created: new Date(),
                                clientId: socket.id,
                                accountId: setup.name
                            } as IDataLogRecord;

                            if (this.dataFlushing === false) {
                                this.queryLogQueue.push(newItem)
                            } else {
                                this.subQueryLogQueue.push(newItem)
                            }

                            this.fastLookupRecordCache.addItem(newItem.key, newItem);
                        }
                    }
                } catch (e) {
                    console.error(e);
                    throw e;
                }
            })

            socket.on('find', (payload, callback) => {
                const argsObject = this.parseClientQueryRequestArgument(payload);
                if (argsObject && argsObject.key) {
                    this.findByKey(argsObject.key).then((result) => {
                        callback(result)
                    })
                }
            })

            socket.on('disconnect', () => {
                this.log('client disconnected', socket.id);

                this.connectionLog.push({
                    clientId: socket.id,
                    created: new Date(),
                    type: "disconnected"
                })
            })
        })
    }

    findByKey = async (key: string) => {
        if (this.fastLookupRecordCache.hasItem(key)) {
            return this.fastLookupRecordCache.getItem(key);
        }

        for (let index = this.dataLogFileList.length - 1; index >= 0; index--) {
            const dataLogFile = this.dataLogFileList[index];

            const file = await fsp.readFile(this.LOG_ROOT_PATH + dataLogFile.fileName, 'utf-8');
            const fileJsons = file
                .split('\n')
                .filter(item => item && item.length > 0)
                .map(item => JSON.parse(item));

            const filtered = fileJsons.filter((item) => {
                return item.key == key
            })

            if (filtered.length > 0) {
                const max = filtered.reduce((a, b) => {
                    if (b === null || b === undefined) {
                        return a;
                    }

                    if (a.created > b.created) {
                        return a;
                    }

                    return b;
                });

                if (max) {
                    return max;
                }
            }
        }

        return null;
    }

    flush = async () => {
        if (this.dataFlushing === true) {
            return;
        }

        this.dataFlushing = true;

        await this.writeDataLogToFileSystem(this.LOG_FILE_BASE_NAME, this.queryLogQueue);

        this.dataFlushing = false;

        this.queryLogQueue = [...this.subQueryLogQueue];
        this.subQueryLogQueue = [];
    }

    private writeDataLogToFileSystem = async (fileBaseName: string, datas: IDataLogRecord[]) => {
        let result = datas
            .map(data => JSON.stringify(data) + '\n')
            .reduce((dataString1, dataString2) => {
                return dataString1 + dataString2;
            }, '');

        const maxVersion = this.dataLogFileList.reduce((a, b) => {
            if (a.version > b.version) {
                return a;
            }

            return b;
        }, {
            fileName: fileBaseName + 0 + '.log',
            active: true,
            version: 0
        });

        let filePath = this.LOG_ROOT_PATH + maxVersion.fileName;

        const isFileExists = await this.fsManager.isFileExists(filePath);
        if (!isFileExists) {
            await fsp.writeFile(filePath, result);

            const newFileResource = {
                fileName: filePath.replace(this.LOG_ROOT_PATH, ''),
                active: true,
                version: maxVersion.version
            }
            this.dataLogFileList.push(newFileResource);

            this.writeFileResourceInfoToFileSystem();
            return;
        }

        const fileSize = (await fsp.stat(filePath)).size;
        if (fileSize >= 2000) {
            const nextVersion = {
                fileName: fileBaseName + (maxVersion.version + 1) + '.log',
                active: true,
                version: (maxVersion.version + 1)
            }

            filePath = this.LOG_ROOT_PATH + nextVersion.fileName;
            await fsp.writeFile(filePath, result);

            this.dataLogFileList = this.dataLogFileList.map(item => {
                return {
                    ...item,
                    active: false
                }
            })

            this.dataLogFileList.push(nextVersion);
            this.writeFileResourceInfoToFileSystem();
        } else {
            await fsp.appendFile(filePath, result);
        }
    }

    private writeFileResourceInfoToFileSystem = async () => {
        await fsp.writeFile(this.RESOURCE_ROOT_PATH + this.FILE_RESOURCE_FILE_NAME, this.dataLogFileList.map(item => JSON.stringify(item)).join('\n'));
    }

    private compactLogFile() {
        if (this.dataFlushing === true) {
            return Promise.resolve();
        }

        return new Promise<void>((resolveMain, rejectMain) => {
            fs.readdir(this.LOG_ROOT_PATH, (error, fileNames) => {
                if (error) {
                    rejectMain(error);
                    return;
                }

                const targetFileNames = fileNames.filter(fileName => true);

                Promise.all<{ fileName: string, data: string }>(targetFileNames.map((fileName) => {
                    return new Promise(resolve => {
                        fsp.readFile(this.LOG_ROOT_PATH + fileName, 'utf-8').then(fileData => {
                            resolve({
                                fileName: fileName,
                                data: fileData
                            })
                        })
                    })
                })).then(fileDataWithNameArray => {
                    fileDataWithNameArray
                        .filter(data => data.fileName !== this.dataLogFileList.filter(item => item.active === true)[0].fileName)
                        .forEach(fileDataWithName => {
                            const lines = fileDataWithName.data
                                .split('\n')
                                .filter(line => line.length > 0)
                                .map(line => {
                                    return JSON.parse(line)
                                });

                            const mm = new Map<string, object>();

                            lines.forEach(line => {
                                if (mm.has(line.key)) {
                                    mm.delete(line.key);
                                }

                                mm.set(line.key, line);
                            })

                            const sortedByKey = Array.from(mm.values()).sort((a, b) => {
                                return (a < b ? -1 : (a > b ? 1 : 0));
                            });

                            fsp.writeFile(this.LOG_ROOT_PATH + 'test' + fileDataWithName.fileName, sortedByKey.map(item => JSON.stringify(item)).join('\n'))
                        })
                })

            });
        })
    }

    parseClientQueryRequestArgument = (args: any) => {
        if (args === null || args === undefined) {
            return null;
        }

        return {
            key: args.key,
            type: args.type,
            payload: args.payload
        }
    }

    log(...data: any[]) {
        console.log(data)
    }

}

class FastLookUpCache {
    private fastLookupRecordCache: Map<string, object> = new Map<string, object>();

    private cachingHitCount: Map<string, number> = new Map<string, number>();

    hasItem = (key: string) => {
        return this.fastLookupRecordCache.has(key);
    }

    addItem = (key: string, value: object) => {
        this.fastLookupRecordCache.set(key, value);
    }

    getItem = (key: string) => {
        if (this.fastLookupRecordCache.has(key)) {
            const resultItem = this.fastLookupRecordCache.get(key) || null;

            if (resultItem) {
                const count = this.cachingHitCount.get(key) || 0
                this.cachingHitCount.set(key, count + 1);
            }

            return resultItem;
        }

        return null;
    }
}