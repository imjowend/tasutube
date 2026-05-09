export namespace main {
	
	export class DownloadItem {
	    id: number;
	    url: string;
	    format: string;
	    quality: string;
	    status: string;
	    error?: string;
	
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
	    }
	}

}

