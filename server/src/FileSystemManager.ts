
import fs from 'fs';

export default class FileSystemManager {
    public writeFile = (filePath: string, data: any) => {
        return new Promise<void>((resolve, reject) => {
            fs.writeFile(filePath, data, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            })
        })
    }

    public appendFile = (filePath: string, data: any) => {
        return new Promise<void>((resolve, reject) => {
            fs.appendFile(filePath, data, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            })
        })
    }

    public readFile = (filePath: string) => {
        return new Promise<string>((resolve, reject) => {
            fs.readFile(filePath, 'utf-8', (error, data) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(data);
            })
        })
    }

    public getFileSize = (filePath: string) => {
        return new Promise<number>((resolve, reject) => {
            fs.stat(filePath, (error, fileStat) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(fileStat.size);
            })
        })
    }

    public isFileExists = (filePath: string) => {
        return new Promise<boolean>((resolve, reject) => {
            try {
                fs.exists(filePath, (exist) => {
                    resolve(exist);
                })
            } catch {
                reject()
            }
        })
    }
}
