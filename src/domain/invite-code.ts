import { customAlphabet } from "nanoid";

// No 0/O/1/I/L — codes get read aloud and retyped from group chats.
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const generateInviteCode = customAlphabet(INVITE_CODE_ALPHABET, 8);
