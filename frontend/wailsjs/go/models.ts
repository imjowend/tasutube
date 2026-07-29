export namespace downloader {
	
	export class VideoMetadata {
	    title: string;
	    thumbnail: string;
	    duration: number;
	    maxHeight: number;
	    availableRes: number[];
	    maxAudioBitrate: number;
	    audioCodec: string;
	    sampleRate: number;
	
	    static createFrom(source: any = {}) {
	        return new VideoMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.thumbnail = source["thumbnail"];
	        this.duration = source["duration"];
	        this.maxHeight = source["maxHeight"];
	        this.availableRes = source["availableRes"];
	        this.maxAudioBitrate = source["maxAudioBitrate"];
	        this.audioCodec = source["audioCodec"];
	        this.sampleRate = source["sampleRate"];
	    }
	}

}

export namespace main {
	
	export class DownloadItem {
	    id: number;
	    url: string;
	    format: string;
	    quality: string;
	    status: string;
	    error?: string;
	    filePath?: string;
	
	    static createFrom(source: any = {}) {
	        return new DownloadItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.format = source["format"];
	        this.quality = source["quality"];
	        this.status = source["status"];
	        this.error = source["error"];
	        this.filePath = source["filePath"];
	    }
	}

}

