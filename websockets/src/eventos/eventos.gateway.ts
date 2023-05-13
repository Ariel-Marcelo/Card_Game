import {WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket} from '@nestjs/websockets';
import {Socket} from 'socket.io';
import axios from "axios";

export interface Jugador {
    id: string;
    nombre: string;
}

export interface Carta {
    code: string;
    image: string;
    images: {
        svg: string;
        png: string;
    }
    value: string;
    suit: string;
}

async function getDeck() {
    const response = await axios.get(
        'https://www.deckofcardsapi.com/api/deck/new/shuffle/?cards=AS,AD,AC,AH,2S,2D,2C,2H,3S,3D,3C,3H,4S,4D,4C,4H,5S,5D,5C,5H,6S,6D,6C,6H,7S,7D,7C,7H,JS,JD,JC,JH,QS,QD,QC,QH,KS,KD,KC,KH'
    );
    return response.data;
}

@WebSocketGateway(
    11202, // Puerto donde esta escuchando el servidor de websockets
    {
        cors: {
            origin: '*', // Habilitando la conexion desde cualquier IP
        }
    })
export class EventosGateway{

    jugadores: Map<string, Jugador[]> = new Map<string, Jugador[]>();

    @SubscribeMessage('solicitudPartida')
    async evaluarSolicitudPartida(
        @MessageBody()
            message: { salaId: string, nombre: string },
        @ConnectedSocket()
            socket: Socket
    ){
        const jugador = {
            id: message.salaId,
            nombre: message.nombre
        }
        let respuesta: string;
        let deck: any;
        if (this.jugadores.has(jugador.id)) {
            if(this.jugadores.get(message.salaId).length === 2) {
                respuesta = 'Esta partida ya tiene 2 jugadores ';
            } else {
                deck = await getDeck();
                this.jugadores.get(message.salaId).push(jugador);
                respuesta = 'Partida lista';
            }
        } else {
            this.jugadores.set(message.salaId, [jugador]);
            respuesta = 'Esperando otro jugador';
        }
        console.log('jugadores', this.jugadores);
        await socket.join(jugador.id.toString());
        socket.broadcast
            .to(jugador.id.toString())
            .emit('estadoSolicitudPartida',
                {mensaje: respuesta, mazo_id: deck? deck.deck_id: null});
        return {mensaje: respuesta, mazo_id: deck? deck.deck_id: null};
    }

    @SubscribeMessage('lanzarCarta')
    lanzarCarta(
        @MessageBody()
            message: { salaId: string, nombre: string, carta: Carta },
        @ConnectedSocket()
            socket: Socket
    ) {

        socket.broadcast
            .to(message.salaId) // Sala a la que enviamos el mensaje
            .emit('escucharMesaDeJuego', {nombre: message.nombre, carta: message.carta}); // nombre del evento y datos a enviar
        return {mensaje: 'ok'}; // Callback
    }

    @SubscribeMessage('llevoCarton')
    carton(
        @MessageBody()
            message: { salaId: string, nombre: string, cartas: Carta[], sumoPuntos: boolean },
        @ConnectedSocket()
            socket: Socket
    ) {
        socket.broadcast
            .to(message.salaId) // Sala a la que enviamos el mensaje
            .emit('seHanLlevadoCarton', {nombre: message.nombre, cartas: message.cartas, sumoPuntos:message.sumoPuntos}); // nombre del evento y datos a enviar
        return {mensaje: 'ok'}; // Callback
    }

    @SubscribeMessage('definirGanador')
    async definirGanador(
        @MessageBody()
            message: { salaId: string, nombre: string  },
        @ConnectedSocket()
            socket: Socket
    ) {
        socket.join(message.salaId);
        socket.broadcast
            .to(message.salaId) // Sala a la que enviamos el mensaje
            .emit('finalizarPartida',
                {  mensaje: 'El ganador es: ' + message.nombre});
        return {mensaje: "Felicidades has ganado :)" };
    }

    @SubscribeMessage('solicitudCartas')
    async solicitudCartas(
        @MessageBody()
            message: { salaId: string  },
        @ConnectedSocket()
            socket: Socket
    ) {
        const deck = await getDeck();
        socket.join(message.salaId);
        socket.broadcast
            .to(message.salaId) // Sala a la que enviamos el mensaje
            .emit('nuevoMazo',
                {  mazo_id: deck? deck.deck_id: null});
        return {mazo_id: deck? deck.deck_id: null};
    }
}