export class Module {

  wasm: WebAssembly.Module;
  memory: WebAssembly.Memory;
  instance?: WebAssembly.Instance;
  
  constructor(wasm: WebAssembly.Module) {
    this.wasm = wasm;
    this.memory = new WebAssembly.Memory({ initial: 1024, maximum: 2048 });    
  }
  
  async instantiate() {
    const imports = {
      env: {
        memory: this.memory,
        send_message: (channel: number, buffer: ArrayBuffer, size: number) => {
          console.log('send_message', channel, buffer, size);
        },
      },
    }    
    this.instance = await WebAssembly.instantiate(this.wasm, imports);
    //@ts-ignore
    this.instance.exports._initialize();
  }

  getRpcDescription(): Uint8Array {
    /// call exported malloc to create space for returned pointer
    const pointer = (this.instance?.exports.malloc as (size: number) => number)(4);
    if (!pointer) {
      throw new Error('Failed to allocate memory for rpc description');
    }
    /// call exported rpc_description to get the description
    const descriptionSize = (this.instance?.exports.rpc_description as (pointer: number) => number)(pointer);
    if (!descriptionSize) {
      throw new Error('Failed to get rpc description');
    }
    /// read the description pointer from the memory
    const descriptionPointer = new Uint32Array(this.memory.buffer, pointer, 1)[0];
    if (!descriptionPointer) {
      throw new Error('Failed to read description pointer');
    }
    /// read the description from the memory by copying it to a new array buffer
    return new Uint8Array(this.memory.buffer, descriptionPointer, descriptionSize);
  }
}