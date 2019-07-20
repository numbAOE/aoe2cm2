import {default as io} from "socket.io-client"
import {DraftServer} from "../DraftServer";
import request from "request"
import Player from "../models/Player";
import {IDraftConfig} from "../models/IDraftConfig";
import getPort from "get-port";
import Preset from "../models/Preset";
import {Barrier} from "../test/Barrier";

let hostSocket: any;
let clientSocket: any;
let httpServer: any;
let httpServerAddr: any;
let ioServer: any;
let draftId: string;

beforeAll((done) => {
    getPort().then((port: number) => {
        console.log("Got port: " + port);
        const serve = DraftServer.serve(port);
        httpServer = serve.httpServer;
        httpServerAddr = serve.httpServerAddr;
        ioServer = serve.io;
        done();
    });
});

afterAll((done) => {
    ioServer.close();
    httpServer.close();
    done();
});

beforeEach((done) => {
    const barrier = new Barrier(2, done);
    request.post(`http://[${httpServerAddr.address}]:${httpServerAddr.port}/preset/new`,
        {body: JSON.stringify({preset: Preset.SIMPLE}), headers: {'Content-Type': 'application/json; charset=UTF-8'}},
        (error, response, body) => {
        const draftIdContainer: { draftId: string } = JSON.parse(body);
        draftId = draftIdContainer.draftId;
        hostSocket = io.connect(`http://[${httpServerAddr.address}]:${httpServerAddr.port}`, {
            query: {draftId: draftId},
            reconnectionDelay: 0,
            forceNew: true,
            transports: ['websocket'],
        });
        hostSocket.on('connect', () => {
            barrier.trigger();
        });
        clientSocket = io.connect(`http://[${httpServerAddr.address}]:${httpServerAddr.port}`, {
            query: {draftId: draftId},
            reconnectionDelay: 0,
            forceNew: true,
            transports: ['websocket'],
        });
        clientSocket.on('connect', () => {
            barrier.trigger();
        });

    });

});

afterEach((done) => {
    if (hostSocket.connected) {
        hostSocket.disconnect();
    }
    if (clientSocket.connected) {
        clientSocket.disconnect();
    }
    done();
});

it('successful join gets a draft config', (done) => {
    hostSocket.emit('join', {name: 'Saladin'}, (data: IDraftConfig) => {
        expect(data).toMatchSnapshot();
        done();
    });
});


it('should send player_joined when player joins', (done) => {
    const barrier = new Barrier(2, done);
    hostSocket.once("player_joined", (message: any) => {
        expect(message.name).toBe('Saladin');
        expect(message.playerType).toBe(Player.HOST);

        hostSocket.once("player_joined", (message: any) => {
            expect(message.name).toBe('Barbarossa');
            expect(message.playerType).toBe(Player.GUEST);
            barrier.trigger();
        });
        clientSocket.emit('join', {name: 'Barbarossa'}, () => {
        });
    });

    clientSocket.once("player_joined", (message: any) => {
        expect(message.name).toBe('Saladin');
        expect(message.playerType).toBe(Player.HOST);

        clientSocket.once("player_joined", (message: any) => {
            expect(message.name).toBe('Barbarossa');
            expect(message.playerType).toBe(Player.GUEST);
            barrier.trigger();
        });
    });

    hostSocket.emit('join', {name: 'Saladin'}, () => {
    });
});