import { v4 as uuidv4 } from 'uuid';

export const generateId = (prefix = 'el') => `${prefix}_${uuidv4().slice(0, 8)}`;
export const generateSlideId = () => generateId('slide');
export const generateElementId = () => generateId('el');
