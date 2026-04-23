declare module "bwip-js" {
  type ToBufferOptions = {
    bcid: string;
    text: string;
    scale?: number;
    paddingwidth?: number;
    paddingheight?: number;
    backgroundcolor?: string;
  };

  function toBuffer(options: ToBufferOptions): Promise<Buffer>;

  const bwipjs: {
    toBuffer: typeof toBuffer;
  };

  export { toBuffer };
  export default bwipjs;
}
