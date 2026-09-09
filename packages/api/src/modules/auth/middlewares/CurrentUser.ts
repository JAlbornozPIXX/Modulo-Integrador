import { createParamDecorator } from "@/shared/controllers/params"; 
import { principalId } from "./principalId";

export const CurrentUser = (): ParameterDecorator => createParamDecorator(principalId);