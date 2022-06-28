import fs from 'fs';
import readline from 'readline'
import { v4 as uuidv4 } from 'uuid';
import express, { Response, Request } from 'express';
import http, { Server } from 'http';
import * as io from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { Http2ServerRequest } from 'http2';

class TestClient {
    // runTest22() {
    //     for (let index = 0; index < 50000; index++) {
    //         const value = JSON.stringify({
    //             value: Math.random().toString()
    //         })

    //         const data = {
    //             job: uuidv4(),
    //             key: 'key' + index.toString(),
    //             value: value,
    //             created: new Date()
    //         }
    //         this.appendData(data)
    //     }
    // }

    // appendData(data: any) {
    //     return new Promise<void>((rslv, rjt) => {
    //         setTimeout(() => {
    //             fs.appendFile('log/file.log', JSON.stringify(data) + '\n', (error) => {
    //                 if (error) {
    //                     rjt(error)
    //                     return;
    //                 }

    //                 rslv();
    //             })
    //         }, 2);
    //     })
    // }

    // runTest2() {
    //     fs.readFile('log/file.log', {
    //         encoding: 'utf8'
    //     }, (error, data) => {
    //         console.log(data);
    //     });
    // }

    // runTest33() {
    //     let app = express();
    //     let httpServer = http.createServer(app);
    //     let ioServer = new io.Server(httpServer);

    //     ioServer.on('connection', (socket) => {
    //         console.log('a user connected');

    //         socket.emit('hello', {
    //             value: 'hello'
    //         })
    //     });

    //     httpServer.listen(3070, () => {
    //         console.log('listen 3070')
    //     })
    // }

    runTest() {
        new DdDbServer().start({
            port: 3070,
            host: 'my server',
            name: 'admin',
            password: 'aaaa'
        })
    }
}

class DdDbServer implements IDdDbServer {

    private ioServer: io.Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any> | null = null;
    private httpServer: http.Server | null = null;

    constructor() {
        let app = express();
        this.httpServer = http.createServer(app);

        this.ioServer = new io.Server(this.httpServer);
    }

    makeDataBase = (name: string,) => {

    }

    start = (setup: IConnectSetup) => {
        if (!this.httpServer || !this.ioServer) {
            throw new Error('HTTP Server Cannot Started');
        }

        this.httpServer.listen(setup.port, () => {
            this.log('listen ' + setup.port)
        })

        this.ioServer.on('connection', (socket) => {
            this.log('new client connected', socket.id);

            socket.on('query', (args) => {
                const argsObject = this.parseClientQueryRequestArgument(args);
                if (argsObject) {
                    if (argsObject.type === 'add') {
                        this.addData({
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
            })

            socket.on('close', () => {
                this.log('nclient close', socket.id);
            })

        })

        return {
            getServerStatus: () => {
                return ServerStatus.RUNNING;
            }
        }
    }

    addData = (data: IDataLogRecord) => {
        return new Promise<void>((rslv, rjt) => {
            fs.appendFile('log/file.log', JSON.stringify(data) + '\n', (error) => {
                if (error) {
                    rjt(error);
                    return;
                }

                rslv();
            })
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

new TestClient().runTest();

// common

interface IConnectSetup {
    host: string,
    port: number,
    name: string,
    password: string
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


        // const fileStream = fs.createReadStream('log/file.log');
        // const readLineInstance = readline.createInterface({
        //     input: fileStream,
        //     crlfDelay: Infinity
        // });

        // readLineInstance.on('line', (line) => {
        //     console.log('Line from file:', line);
        // });
        // readLineInstance.