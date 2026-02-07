declare module 'pdf-poppler' {
  export interface ConvertOptions {
    format?: 'png' | 'jpeg' | 'jpg' | 'tiff';
    out_dir?: string;
    out_prefix?: string;
    page?: number | null;
    scale?: number;
    quality?: number;
  }

  export function convert(
    filePath: string,
    options: ConvertOptions
  ): Promise<void>;

  export function info(filePath: string): Promise<any>;
}

