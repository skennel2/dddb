
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
        const result = await prompt.get(['key', 'value']);

        if (result.key === 'rrr') {
            setTimeout(() => {
                randomAttack()
            }, 5000);
            break;
        } else {
            sock.emit('query', {
                key: result.key,
                type: 'add',
                payload: result.value
            })
        }

    }
}

function randomAttack() {
    const sock = io("http://localhost:3070", {
        reconnection: true,
    });
    for (let index = 0; index < 25000; index++) {
        setTimeout(() => {
            try {
                const emited = sock.emit('query', {
                    key: 'auto_test_' + index,
                    type: 'add',
                    payload: Math.random().toString()
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
        }, Math.floor(Math.random() * (15000 - 1500)) + 1500);
    }
}

terminalUI();