/*  Copyright 2016 Peter Kehl
    This file is part of SeLite Preview.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
"use strict";

// Anonymous function to prevent leaking into Selenium global namespace
( function() {
    //var console= Components.utils.import("resource://gre/modules/Console.jsm", {}).console;
    var nsIMIMEService= Components.classes["@mozilla.org/mime;1"].getService(Components.interfaces.nsIMIMEService);
    var StringView= Components.utils.import("chrome://selite-preview/content/StringView.js", {}).StringView;
    
    /** Load a given file asynchronously.
     *  @param {string} url URL of the file. It must be a full URL (including the scheme/protocol).
     *  @return {Promise} A Promise that will resolve to content of the file: either  to a string (if binary is not set/false), or to an ArrayBuffer (if binary is true). On failure or timeout it will be rejected.
     * */
    Selenium.prototype.loadFile= function loadFile( url, binary=false ) {
        // Refuse data: URL. That's because even though XMLHttpRequest supports 'data:' URLs, then its responseXML is null. See https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest
        if( url.indexOf( 'data:' )===0 ) {
            throw new Error( "Parameter documentURL must not ba a data: URL: " +url );
        }
        return new Promise( (resolve, reject)=> {
            var request = new XMLHttpRequest();
            !binary || (request.responseType= 'blob');
            request.onload= ()=> {
                if (request.readyState === 4) {
                    if (request.status === 200) {
                        if( !binary ) {
                            resolve( request.responseText );
                        }
                        else {
                            var reader = new FileReader();
                            reader.addEventListener( "loadend", ()=> resolve( reader.result ) );
                            reader.readAsArrayBuffer( request.response );                                         }
                    }
                    else {
                        reject( "Couldn't load " +url+ ". " +request.statusText );
                    }
                }
            };
            request.onerror= (event)=> {
                reject( "Couldn't load " +url );
            };
            request.ontimeout= (event)=> {
                reject( "Loading " +url+ " timed out." );
            };

            request.open("GET", url, true );
            request.timeout= this.defaultTimeout-50;
            request.send( null );
        } );
    };
    
    /** Encode a file as a data: URI. See https://developer.mozilla.org/en-US/docs/Web/HTTP/data_URIs.
     *  It also loads content of files referenced by <img src="...">, <link href="..." with rel="stylesheet" or with as="script" or with type="...">,  <script src="...">. It changes src="..." or href="..." of those elements to use data: containing the loaded content.
     *  @see Editor.prototype.openPreview()
        @param {string} filePathOrURL File path or URL of the HTML/XML preview file/template. It must be a full URL (including the scheme/protocol), or a full path. If it's a file path, you can use either / or \ as directory separators (they will get translated for the current system). To make it portable, specify it as a relative path and pass it appended to result of SeLiteSettings.getTestSuiteFolder(). It must not be a data: URL. It must not contain a #hash/fragment part.
     *  @param {boolean} [preferUrlEncode=true] Whether to prefer URL encoding (somewhat human-readable) rather than base 64 encoding. Only applicable to text fiels - binary files are always encoded at base 64.
     *  @param {function} [contentHandler=undefined] Function(content, url, preferUrlEncode) which returns a Promise of the handled content. Used for deep/recursive handling. Parameter url is used only for resolving relative URLs for documents that are handled recursively.
     *  @return {Promise} Promise that resolves to encoded content (and handled, if contentHandler is passed); it rejects on error or on timeout. On success it resolves to string, which is a data: URI for content of given documentURL, including content of images/scripts/stylesheets through data: URIs, too.
     * */
    Selenium.prototype.encodeFile= function encodeFile( url, mime, preferUrlEncode=true, contentHandler=undefined ) {
        var contentIsBinary= !mime.startsWith('text/'); //@TODO also MIME of .xml, .xhtml; and also accept preferUrlEncode to be an array or MIME prefixes, or a RegExp
        
        return this.loadFile( url,  contentIsBinary ).then(
        unprocessedContent => {
            
            var contentHandlerPromise=
                !contentIsBinary && contentHandler
                ? contentHandler( unprocessedContent, url, preferUrlEncode )
                : Promise.resolve( unprocessedContent );
            
            return contentHandlerPromise.then(
            processedContent => {
                //@TODO change preferUrlEncode to reverse
                return Selenium.encodeContent( processedContent, mime, contentIsBinary, preferUrlEncode );
            } );
        } );
    };
    
    /**
     * @param {string} filePathOrURL See Selenium.prototype.encodeFile().
     * @param {boolean} [preferUrlEncode]
     * @param {string|array|RegExp|function|undefined} fetchFilter Filter that determines for a given URL whether to fetch it or not.
     * - String application webroot. Any resources under it, even if referenced through full URLs, will be fetched.
     * - Array of webroots. Any resources under them will be fetched.
     * - RegExp matching any URLs to fetch.
     * - Function(url) that returns whether to fetch a URL.
     * - undefined to fetch any URLs on the same server (or under same top folder/Windows volume).
     * @return {Promise} Promise of a string content.
     * */
    Selenium.prototype.encodeFileWithHandler= function encodeFileWithHandler( filePathOrURL, preferUrlEncode=true, fetchFilter=undefined, handler=undefined ) {
        var url= Selenium.urlFor( filePathOrURL, true ); // if a filepath, this translates it to a URL
        var uri= Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService).newURI( url, null, null);
        var mime= nsIMIMEService.getTypeFromURI( uri );
        
        return this.encodeFile( url, mime, preferUrlEncode,
            handler
            ? handler.bind(undefined, fetchFilter) // @TODO also bind preferUrlEncode and MIME, and re-order in encodeFileRecursiveHandler()
            : undefined
        );
    };
    
    Selenium.prototype.encodeFileRecursively= function encodeFileRecursively( filePathOrURL, preferUrlEncode=true, fetchFilter=undefined ) {
        return this.encodeFileWithHandler( filePathOrURL, preferUrlEncode, fetchFilter, Selenium.prototype.encodeFileRecursiveHandler.bind(this) );
    };
    
    /*var indentIndex= 0;
    function indent( indentation, str ) { return str.replace( /\n/g, "\n" +indentation+(++indentIndex)+indentation ); }*/
    // Don't match url() case insensitively, because URL(...) is a standard class in Javascript files
    var handledLink= /(src=|href=)['"]([^'"]+)['"]|url\( *['"]?([^'"]+)['"] *\)/g;
    var urlRoot= /^((?:file:\/\/\/|[a-z]:\/\/)[^/]+)/;
    
    /** @param {string|array|RegExp|function|undefined} filter See Selenium.prototype.encodeFileRecursively().
     * */
    Selenium.prototype.encodeFileRecursiveHandler= function encodeFileRecursiveHandler( filter, content, contentURL, preferUrlEncode=true ) {
        if( filter===undefined ) {
            var contentRootMatch= urlRoot.exec(contentURL);
            if( contentRootMatch ) {
                filter= contentRootMatch[0];
            }
            else {
                return Promise.reject( "There was no filter, and given contentURL seems invalid: " +contentURL );
            }
        }
        if( typeof filter==='string' ) {
            filter= [filter];
        }
        if( Array.isArray(filter) ) {
            filter= new RegExp( '^(' +filter.join('|')+ ')' );
        }
        SeLiteMisc.ensureInstance( filter, [RegExp, Function], 'filter' );
                
        var result= Promise.resolve('');
        var lastMatchLastIndex= 0;
        var match;
        while( ( match=handledLink.exec(content) )!==null ) {
            // The following anonymous function keeps the match details before we fire up successive handling, because then handledLink and match will be updated.
            ( ()=>{
                var wholeMatch= match[0];
                var sincePreviousMatch= content.substring( lastMatchLastIndex, match.index );

                var url= match[2] || match[3];

                var matchedSrcOrHref= match[1]!==undefined;
                // Always return quotes, replacing any previous apostrophes, for these URLs. @TODO comment
                var beforeUrl= matchedSrcOrHref
                    ? match[1]+ '"'
                    : 'url("';
                var afterUrl= matchedSrcOrHref
                    ? '"'
                    : '")';

                result= result.then(
                    previous => {
                        //Convert relative URL to absolute (based on the document being currently processed). If url is absolute, the following leaves it as it was.
                        var convertedURL= new URL( url, contentURL ).href; // Based on https://developer.mozilla.org/en-US/docs/Web/API/URL/URL
                        
                        // The following automatically excludes URLs with data: or javascript: scheme.
                        var shouldFetch= SeLiteMisc.isInstance(filter, RegExp )
                            ? filter.test( convertedURL )
                            : filter( convertedURL );// filter is a function
                        if( !shouldFetch ) {
                            return previous+ sincePreviousMatch+ wholeMatch;
                        }
                        
                        var contentHandler= convertedURL.endsWith('.css')
                            ? Selenium.prototype.encodeFileRecursiveHandler.bind(this) // recursive - to fetch any images referenced from this CSS file
                            : undefined; // this file is a leaf, no deeper recursion
                        
                        return this.encodeFileWithHandler( convertedURL, preferUrlEncode,filter, contentHandler ).then(
                            processed => 
                                previous+ sincePreviousMatch+ beforeUrl+ processed+ afterUrl
                        );
                    }
                );
            } )();
            lastMatchLastIndex= handledLink.lastIndex;
        }
        result= result.then(
            (previous)=>
                previous+ content.substring(lastMatchLastIndex)
        );
        return result;
    };
    
    /**
     * @param {(string|ArrayBuffer)} content
    @return {Promise} Promise that resolved to encoded content; it rejects on error or on timeout.
    */
    Selenium.encodeContent= function encodeContent( content, mime, contentIsBinary=false, preferUrlEncode=true ) {
        (typeof content==="object") === SeLiteMisc.isInstance( content, ArrayBuffer ) || SeLiteMisc.fail( "Parameter content must be a primitive string, or an ArrayBuffer.");
        (typeof content==="object") === contentIsBinary || SeLiteMisc.fail( "Parameter content was " +typeof content+ ", but parameter contentIsBinary was " +contentIsBinary );
        //  TODO When you pass the result as a part of processed HTML of another file - e.g. the result of this function will serve in as a URL in link="..." or src="..." attributes, then enclose the encoded result within quotes "...", not within apostrophes '...' - because the encoded text may contain apostrophes, but no quotes.

            //@TODO var body= doc.getElementsByTagNameNS( "http://www.w3.org/1999/xhtml", 'body')[0]; // this works even if the document's MIME is text/html rather than text/xml
            //body.innerHTML;

            // Loop over elements. If can't get the file, skip.
            // Try to modify DOM and then user innerHTML
        var encoded= contentIsBinary
            ? new StringView( content, 'ASCII').toBase64( true )
            : ( !preferUrlEncode
                ? btoa(content)
                : encodeURIComponent(content)
              );
        return 'data:' +mime+
            (contentIsBinary || !preferUrlEncode
                ? ';base64'
                : ''
            ) + ',' + encoded;
    };
}) ();