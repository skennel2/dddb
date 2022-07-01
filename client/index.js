
import { io } from "socket.io-client";
import prompt from 'prompt';

function test() {

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

// test();

async function terminalUI() {
    const sock = io("http://localhost:3070");

    prompt.start();

    while (1) {
        console.log('1. find 2. update')
        const menu = await prompt.get(['job']);

        if (menu.job === '1') {
            const result = await prompt.get(['key']);

            sock.emit('find', {
                key: result.key,
                type: 'find',
            }, (response) => {
                console.log('response: ', response)
            })
        } else if (menu.job === '2') {
            const result = await prompt.get(['key', 'value']);

            sock.emit('query', {
                key: result.key,
                type: 'add',
                payload: result.value
            })
        } else if (menu.job === 'rrr') {
            setTimeout(() => {
                randomAttack()
            }, 5000);
        } else if (menu.job === 'stop') {
            sock.emit('stop')
        } else if (menu.job === 'start') {
            sock.emit('start')
        }
    }
}

function randomAttack() {
    const sock = io("http://localhost:3070", {
        reconnection: true,
    });

    let timeout = Math.floor(Math.random() * (15000 - 1500)) + 1500;
    timeout = 10;

    for (let index = 0; index < 40000; index++) {
        setTimeout(() => {
            try {
                const emited = sock.emit('query', {
                    key: 'key' + (Math.floor(Math.random() * (10 - 1)) + 1).toString(),
                    type: 'add',
                    payload: 'auto_test_' + index,
                })
                emited.onerror = (e) => {
                    console.error(e)
                }

                sock.onerror = (e) => {
                    console.error(e)
                }

            } catch (e) {
                console.error(e);
                throw e;
            }
        }, timeout);
    }
}

terminalUI();