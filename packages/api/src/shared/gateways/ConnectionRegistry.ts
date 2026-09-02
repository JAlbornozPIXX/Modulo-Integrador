import type { GatewaySocket, OutboundMessage } from '@/shared/contracts/gateway';

export default class ConnectionRegistry{
    #sockets = new Set<GatewaySocket>();
    #rooms = new Map<string, Set<GatewaySocket>>();
    #memberships = new WeakMap<GatewaySocket, Set<string>>();

    add(socket: GatewaySocket){
        this.#sockets.add(socket);
    }

    remove(socket: GatewaySocket){
        this.leaveAll(socket);
        this.#sockets.delete(socket);
    }

    join(socket: GatewaySocket, room: string){
        let members = this.#rooms.get(room);
        if(!members){
            members = new Set();
            this.#rooms.set(room, members);
        }
        members.add(socket);

        let memberships = this.#memberships.get(socket);
        if(!memberships){
            memberships = new Set();
            this.#memberships.set(socket, memberships);
        }
        memberships.add(room);
    }

    leave(socket: GatewaySocket, room: string){
        const members = this.#rooms.get(room);
        members?.delete(socket);
        if(members?.size === 0) this.#rooms.delete(room);

        const memberships = this.#memberships.get(socket);
        memberships?.delete(room);
        if(memberships?.size === 0) this.#memberships.delete(socket);
    }

    leaveAll(socket: GatewaySocket){
        const memberships = this.#memberships.get(socket);
        if(!memberships) return;

        for(const room of memberships) this.leave(socket, room);
    }

    broadcast(message: OutboundMessage<unknown>){
        this.#send(this.#sockets, message);
    }

    sendToRoom(room: string, message: OutboundMessage<unknown>){
        const members = this.#rooms.get(room);
        if(members) this.#send(members, message);
    }

    #send(sockets: Iterable<GatewaySocket>, message: OutboundMessage<unknown>){
        const raw = JSON.stringify(message);
        for(const socket of sockets) socket.send(raw);
    }

    get size(): number{
        return this.#sockets.size;
    }
}
