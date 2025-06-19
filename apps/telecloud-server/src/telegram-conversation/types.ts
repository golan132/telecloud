import { CONVERSATION_STATE } from './constants';

export type UserContext = {
  state: CONVERSATION_STATE;
};

export type BotResponse = {
  text: string;
  reply_markup?: any;
};
