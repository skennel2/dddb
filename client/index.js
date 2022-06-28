
import { io } from "socket.io-client";
function test() {
    const sock = io("http://localhost:3070");

    sock.on('hello', (args) => {
        console.log(args)
    })

    sock.emit('query', {
        key: '222', 
        type: 'add',
        payload: { value: 'test' }
    })


    // sock.close();
}

test();

