import io from "socket.io-client";
import {useState, useEffect} from "react";
import {useForm} from "react-hook-form";
import axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import {
    SolicitudPartidaForm,
    ResponseSolicitudPartida,
    Carta,
    ResponseCartas,
    Score,
} from "../interfaces";
// Websocket
const servidorWebsocket = "http://localhost:11202";
const socket = io(servidorWebsocket);
// Order
const values = ['ACE','2', '3', '4', '5', '6', '7',  'JACK', 'QUEEN', 'KING'];
// Estilos
const estiloImg = {
    width: '100px',
    height: '100px',
}

export default function () {
    const [isConnected, setIsConnected] = useState(false);
    const [cards, setCards] = useState<Carta[]>([]);
    const [deck_id, setDeck_id] = useState<string | null>(null);
    const [partidaInfo, setPartidaInfo] = useState<SolicitudPartidaForm>({salaId: '', nombre: ''});
    const [cardsOnTable, setCardsOnTable] = useState<Map<string, Carta[]>>(new Map());
    const [message, setMessage] = useState<string>('');
    const [score, setScore] = useState<Score>({home: 0, visitor: 0});
    const [lastCard, setLastCard] = useState<Carta | null>(null);

    const {control, register, handleSubmit, formState: {errors, isValid}} = useForm({
        defaultValues: {
            salaId: '',
            nombre: '',
        },
        mode: 'all'
    })

    useEffect(
        () => {
            socket.on("connect", () => {
                setIsConnected(true);
            });
            socket.on("disconnect", () => {
                setIsConnected(false);
            });
            socket.on('estadoSolicitudPartida',  (data: {message: String, mazo_id: string}) => {
                setDeck_id(data.mazo_id);
            });
            socket.on('escucharMesaDeJuego', (data: {nombre: string, carta: Carta}) => {
                setCardsOnTable((prev) => {
                    const newMap = new Map(prev);
                    if (!newMap.has(data.nombre)) {
                        newMap.set(data.nombre, [data.carta]);
                    } else {
                        const cartas = newMap.get(data.nombre) || [];
                        newMap.set(data.nombre, [...cartas, data.carta]);
                    }
                    return newMap;
                } );
                setLastCard(data.carta);
            });
            socket.on('seHanLlevadoCarton', (data: {nombre: string, cartas: Carta[], sumoPuntos: boolean}) => {
                // retiro
                data.cartas.forEach((carta) => {
                    console.log('REMUEVO LA CARTA CON EL CODIGO: ',carta.code)
                    removeCardFromTableByCode(carta.code);
                } );
                // reinicio carta caida
                setLastCard(null);
                // subir el puntaje de visitors si sumoPuntos es true
                if (data.sumoPuntos) {
                    setScore((prev) => {
                        return {
                            ...prev,
                            visitor: prev.visitor + 2,
                        }
                    })
                }
            });
            socket.on(
                'nuevoMazo',
                (data: {mazo_id: string | null }) => {
                    // Limpiar Mesa de Juego
                    setCardsOnTable(new Map());
                    // reinicio carta caida
                    setLastCard(null);
                    if (data.mazo_id !== null) {
                        setDeck_id(data.mazo_id);
                    }
                }
            )

            socket.on('finalizarPartida', (data: {message: string}) => {
                setMessage(data.message);
            })

        }, []

    );

    useEffect(() => {
        if (score.home === 40) {
            socket.emit(
                'definirGanador',
                {salaId: partidaInfo.salaId, nombre: partidaInfo.nombre},
                (respuesta: {mensaje: string}) => {
                    setMessage(respuesta.mensaje);
                }
            )
        }
    } , [score])

    const  enviarSolicitudPartida = (data: SolicitudPartidaForm) => {
        const basicInformation = {
            salaId: data.salaId,
            nombre: data.nombre,
        }
        setPartidaInfo(basicInformation);
        socket.emit(
            "solicitudPartida",
            basicInformation,
            (respuesta: ResponseSolicitudPartida) => {
                if (respuesta.mazo_id !== null) {
                    setDeck_id(respuesta.mazo_id);
                }
            });
    }
    const pedirCartas = async () => {
        const url = `https://www.deckofcardsapi.com/api/deck/${deck_id}/draw/?count=5`;
        const respuesta = await axios.get<ResponseCartas>(url);
        if (respuesta.data.success) {
            setCards(respuesta.data.cards);
        } else {
            // REMOVER TODAS LAS CARTAS DE LA MESA
            setCardsOnTable(new Map());
            socket.emit(
                'solicitudCartas',
                {salaId: partidaInfo.salaId},
                (respuesta: {mazo_id: string | null}) => {
                if (respuesta.mazo_id !== null) {
                    setDeck_id(respuesta.mazo_id);
                }
            } );
        }
    }
    // Lanzar carta
    const lanzarCarta = (carta: Carta) => {

        const cartaLanzada = {
            salaId: partidaInfo.salaId,
            nombre: partidaInfo.nombre,
            carta: carta,
        }
        let sumoPuntos = false;
        // Si hay cartas sobre la mesa
        Array.from(cardsOnTable.keys()).forEach((key) => {
            // Comprobar si la carta que lanzo tiene el mismo valor que una de las cartas de mi oponente
            if (key !== partidaInfo.nombre) {
                // Si la carta de mi oponente coincide con la carta que lanzo
                if (carta.value === lastCard?.value) {
                    // Aumento mi puntaje
                    sumoPuntos = true;
                    setScore((prev) => {
                        return {
                            ...prev,
                            home: prev.home + 2,
                        }
                    });
                    // Instancio el objeto que voy a enviar al servidor con las cartas que me llevo
                    const cartaARemover = {
                        salaId: partidaInfo.salaId,
                        nombre: key,
                        cartas: [lastCard],
                        sumoPuntos: sumoPuntos,
                    }
                    // Retiro la carta de mi oponente del front
                    removeCardFromTableByCode(lastCard.code);

                    // Busco en todas las cartas de la mesa si hay un valor siguiente
                    let index = values.indexOf(lastCard.value);
                    while (index != values.length - 1) { // mientras no sea la ultima carta
                        index++;
                        console.log('Voy a buscar si existe el valor: ' + values[index])
                        let card = getCardOnTableByValue(values[index]);
                        console.log('Esta es la carta que encontre: ' + card);
                        if (card != null) {
                            console.log('Encontre la carta: ' + card);
                            cartaARemover.cartas.push(card);
                            // Retiro la carta del front
                            removeCardFromTableByCode(card.code)
                        } else {
                            break;
                        }
                    }
                    // notificar al servidor las cartas a remover
                    socket.emit(
                        'llevoCarton',
                        cartaARemover,
                        (respuesta: {message: string}) => {
                            console.log('Se notifico caida de cartas');
                            console.log(respuesta);
                        }
                    );
                }
            }

        })

        // Si no hay cartas sobre la mesa
        if (cardsOnTable.size == 0 || !sumoPuntos) {
            // Pon la carta sobre la mesa
            setCardsOnTable((prev) => {
                const newMap = new Map(prev);
                if (!newMap.has(partidaInfo.nombre)) {
                    newMap.set(partidaInfo.nombre, [carta]);
                } else {
                    const cartas = newMap.get(partidaInfo.nombre) || [];
                    newMap.set(partidaInfo.nombre, [...cartas, carta]);
                }
                return newMap;
            } );
            // Lanza la carta al servidor
            socket.emit(
                'lanzarCarta',
                cartaLanzada,
                (respuesta: {message: string}) => {
                    console.log(respuesta);
                }
            );
        }



        removeCardFromMyHand(carta);
    }

    const getCardOnTableByValue =  (value: string): Carta | null => {
        let cartaToReturn: Carta | null = null;
        Array.from(cardsOnTable.keys()).forEach((key) => {
            const cartasDeJugador = cardsOnTable.get(key) || [];
            cartasDeJugador.forEach((carta) => {
                console.log('Comparo ' + carta.value + ' con ' + value)
                if (carta.value == value) {
                    console.log('Encontre la carta: ' + carta)
                    cartaToReturn = carta;
                }
            })
        })
        return cartaToReturn;
    }

    const removeCardFromTableByCode = (code: string) => {
        setCardsOnTable((prev) => {
            const newMap = new Map(prev);
            Array.from(newMap.keys()).forEach((key) => {
                const cartas = newMap.get(key) || [];
                newMap.set(key, cartas.filter((carta) => carta.code !== code));
            })
            return newMap;
        } );
    }
    const removeCardFromMyHand = (carta: Carta) => {
        setCards(cards.filter((card) => card.code !== carta.code));
    }

    return (
        <div className={'container'}>
            {deck_id === null &&
                <form onSubmit={handleSubmit(enviarSolicitudPartida)} className={'d-flex flex-column'}>
                    <label> <strong>Id de la sala</strong></label>
                    <input type="text" {...register('salaId')}/>
                    <label> <strong> Nombre </strong></label>
                    <input type="text" {...register('nombre')}/>
                    <button type="submit" className={'btn btn-warning mt-3'}>Unirse Partida</button>
                </form>
            }

            {deck_id &&
                <div>
                    <button onClick={() => {pedirCartas()}} className={'btn btn-success mt-3'}>Pedir cartas</button>
                    <div>
                        {cards.length > 0 && <h4 className={'text-center'}>Cartas en mano</h4>}
                        {
                            cards.map((card, index) => {
                                return <img key={index} src={card.image} alt={card.value} style={estiloImg} onClick={()=> lanzarCarta(card)}/>
                            })
                        }
                    </div>
                    <h1>{message}</h1>
                    <div>
                        <h4 className={'text-center'}> Locales: {score.home}</h4>
                        <h4 className={'text-center'}> Visitantes: {score.visitor}</h4>
                    </div>
                    <h1 className={'text-center'}>Mesa de Juego</h1>
                    <div className={'bg-amber-200'}>
                        {
                            Array.from(cardsOnTable).map(([key, value]) => {
                                return (
                                    <div>
                                        {
                                            value.map((card, index) => {
                                                return <img key={index} src={card.image} alt={card.value} style={estiloImg}/>
                                            })
                                        }
                                    </div>
                                )
                            })
                        }
                    </div>
                </div>
            }
        </div>
    )
}
