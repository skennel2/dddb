import fs from 'fs';
import readline from 'readline'
import { v4 as uuidv4 } from 'uuid';
import express, { Response, Request } from 'express';
import http, { Server } from 'http';
import * as io from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { Http2ServerRequest } from 'http2';
import { rejects } from 'assert/strict';
import { version } from 'os';

class DdDbServer implements IDdDbServer {

    private ioServer: io.Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any> | null = null;
    private httpServer: http.Server | null = null;
    private connectionLog: {
        clientId: string,
        created: Date;
        type: 'connected' | 'disconnected'
    }[] = [];

    private queryLogQueue: IDataLogRecord[] = [];
    private subQueryLogQueue: IDataLogRecord[] = [];
    private dataFlushing: boolean = false;
    private readonly LOG_ROOT_PATH = 'log/';
    private readonly LOG_FILE_BASE_NAME = 'datalog';
    private fileMaxVersion = 0;

    constructor() {
        let app = express();
        this.httpServer = http.createServer(app);

        this.ioServer = new io.Server(this.httpServer);
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

    private setUp = (setup: IConnectSetup) => {
        return new Promise<void>((resolve, reject) => {
            fs.readdir(this.LOG_ROOT_PATH, (error, fileNames) => {
                if (error) {
                    reject();
                }

                const versions = fileNames
                    .filter(fileName => {
                        return fileName.startsWith(this.LOG_FILE_BASE_NAME) && fileName.endsWith('.log');
                    }).map((fileName) => {
                        return fileName.replace(this.LOG_FILE_BASE_NAME, '').replace('.log', '');
                    }).map(versionNumber => {
                        return Number(versionNumber);
                    })
                
                const maxVersion = versions.reduce((version1, version2) => {
                    return version1 > version2 ? version1 : version2
                }, 0);

                this.fileMaxVersion = maxVersion;

                resolve();
            })
        })

    }

    private processStart = (setup: IConnectSetup) => {
        if (!this.httpServer || !this.ioServer) {
            throw new Error('HTTP Server Cannot Started');
        }

        setInterval(async () => {
            await this.flush();
        }, setup.flushInterval !== undefined ? setup.flushInterval : 5000)

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
                    if (argsObject) {
                        if (argsObject.type === 'add') {
                            if (this.dataFlushing === false) {
                                this.queryLogQueue.push({
                                    id: uuidv4(),
                                    status: 'add',
                                    key: argsObject.key,
                                    value: argsObject.payload,
                                    created: new Date(),
                                    clientId: socket.id,
                                    accountId: setup.name
                                })
                            } else {
                                this.subQueryLogQueue.push({
                                    id: uuidv4(),
                                    status: 'add',
                                    key: argsObject.key,
                                    value: argsObject.payload,
                                    created: new Date(),
                                    clientId: socket.id,
                                    accountId: setup.name
                                })
                            }
                        }
                    }
                } catch (e) {
                    console.error(e);
                    throw e;
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

    flush = async () => {
        if (this.dataFlushing === true) {
            return;
        }

        this.dataFlushing = true;

        await this.writeLogDataToFile(this.LOG_FILE_BASE_NAME, this.queryLogQueue);

        this.dataFlushing = false;

        this.queryLogQueue = [...this.subQueryLogQueue];
        this.subQueryLogQueue = [];
    }

    private writeLogDataToFile = async (fileBaseName: string, datas: IDataLogRecord[]) => {
        let result = datas
            .map(data => JSON.stringify(data) + '\n')
            .reduce((dataString1, dataString2) => {
                return dataString1 + dataString2;
            }, '');

        let filePath = this.LOG_ROOT_PATH + fileBaseName + this.fileMaxVersion + '.log';
        const isFileExists = await this.isFileExists(filePath);

        if (isFileExists) {
            const fileSize = await this.getFileSize(filePath);
            if (fileSize >= 4000) {
                filePath = this.LOG_ROOT_PATH + fileBaseName + ++this.fileMaxVersion + '.log';
                await this.writeFile(filePath, result);
            } else {
                await this.appendFile(filePath, result);
            }
        } else {
            await this.writeFile(filePath, result);
        }
    }

    private writeFile = (filePath: string, data: any) => {
        return new Promise<void>((resolve, reject) => {
            fs.writeFile(filePath, data, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            })
        })
    }

    private appendFile = (filePath: string, data: any) => {
        return new Promise<void>((resolve, reject) => {
            fs.appendFile(filePath, data, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            })
        })
    }

    private getFileSize = (filePath: string) => {
        return new Promise<number>((resolve, reject) => {
            fs.stat(filePath, (error, fileStat) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(fileStat.size);
            })
        })
    }

    private isFileExists = (filePath: string) => {
        return new Promise<boolean>((resolve, reject) => {
            try {
                fs.exists(filePath, (exist) => {
                    resolve(exist);
                })
            } catch {
                reject()
            }
        })
    }

    /**
     * key: 
     * 
     * @param args 
     */
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

// common

interface IConnectSetup {
    host: string,
    port: number,
    name: string,
    password: string,
    flushInterval?: number,
}

interface IClient {
    host: string,
    port: number,
    name: string,
}

// client side

interface IDdDbClient {
    getConnection: (setup: IConnectSetup) => Promise<IConnection>;
}

interface IDdDbExecutor {
    findOne: (key: string) => Promise<any>;
    insert: (key: string, value: any) => Promise<void>;
    update: (key: string, value: any) => Promise<void>;
    delete: (key: string) => Promise<void>;
}

interface IConnection {
    getExecutor: () => IDdDbExecutor;
    close: () => Promise<void>;
}

interface INetwork {
    sendMessage: (message: string) => Promise<void>
}

// server side

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

interface IRequest {
    client: IClient,
    payLoad: any
}

enum ServerStatus {
    RUNNING, STOP
}

class TestClient {
    runTest() {
        const server = new DdDbServer().start({
            port: 3070,
            host: 'my server',
            name: 'admin',
            password: 'aaaa'
        })
    }
}

new TestClient().runTest();


        // const fileStream = fs.createReadStream('log/file.log');
        // const readLineInstance = readline.createInterface({
        //     input: fileStream,
        //     crlfDelay: Infinity
        // });

        // readLineInstance.on('line', (line) => {
        //     console.log('Line from file:', line);
        // });
        // readLineInstance.


