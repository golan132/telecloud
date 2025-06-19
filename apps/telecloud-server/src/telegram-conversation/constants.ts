export enum CONVERSATION_STATE {
  Idle = 'Idle',
  WaitingForChannelForward = 'WaitingForChannelForward',
}

export const KEYBOARD: string[][] = [
  ['Add Cloud Storage Channel'],
  ['📤 Upload From Drive'],
  ['📥 Restore Images'],
  ['Help'],
];

export const HELP_TEXT: string =
  `This bot helps you forward files to private storage channels.\n\n` +
  `- Press "Add Cloud Storage Channel" and forward a message from that channel.\n` +
  `- Press "Upload From Drive" to scan your local disk and send images.\n` +
  `- Press "Restore Images" to download backed-up files from the cloud.\n` +
  `- After that, any file or image you send here will be forwarded to the channel(s).`;
