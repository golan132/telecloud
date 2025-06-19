export type UploadedFileMetadata = {
  filePath: string;
  file_id: string;
  caption: string;
  channelId: string | number;
};

export type UploadResult = {
  file_id: string;
  channelId: string | number;
};

export type UploadStats = {
  startTime: number;
  totalFiles: number;
  uploadedFiles: number;
  lastReportTime: number;
  filesUploadedSinceLastReport: number;
};
