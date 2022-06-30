
// common

import DdDbServer from "./DdDbServer";

interface IClient {
    host: string,
    port: number,
    name: string,
}

// client side

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

interface IRequest {
    client: IClient,
    payLoad: any
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


