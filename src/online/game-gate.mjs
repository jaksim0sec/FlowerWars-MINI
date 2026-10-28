// Only stops the existing local simulation while an online room owns the screen.
let onlineActive=false;
export const setOnlineActive=value=>{onlineActive=Boolean(value);};
export const pauseSinglePlayer=()=>onlineActive;
