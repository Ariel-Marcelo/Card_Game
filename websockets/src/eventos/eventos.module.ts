import {EventosGateway} from "./eventos.gateway";
import {Module} from "@nestjs/common";

@Module({
    providers: [
        EventosGateway
    ],
})
export class EventosModule {
}