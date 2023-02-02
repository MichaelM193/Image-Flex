'use strict'

const {parse} = require('querystring')
const axios = require('axios')
const DEFAULT_EXTENSION = 'webp'
const BAD_JPG_EXTENSION = 'jpg'
const GOOD_JPG_EXTENSION = 'jpeg'

const UriToS3Key = async (event) => {
    console.log("Event param from UriToS3Key: \n" + JSON.stringify(event))

    const {request, request: {headers, querystring, uri}} = event.Records[0].cf
    const queryObj = parse(querystring)
    const {h: height = '', w: width} = parse(querystring)

    if (!width || isNaN(parseInt(width, 10))) {
        console.log("Event Response without any change with no width key: \n" + JSON.stringify(request))
        return request
    }

    const [, prefix, imageName, prevExtension] = uri.match(/(.*)\/(.*)\.(\w*)/)
    const acceptHeader = Array.isArray(headers.accept)
        ? headers.accept[0].value
        : ''
    const nextExtension = acceptHeader.indexOf(DEFAULT_EXTENSION) !== -1
        ? DEFAULT_EXTENSION
        : prevExtension === BAD_JPG_EXTENSION
            ? GOOD_JPG_EXTENSION
            : prevExtension.toLowerCase()
    const dimensions = height
        ? `${width}x${height}`
        : width
    const key = `${prefix}/${dimensions}/${imageName}.${nextExtension}`

    const presignedkey = [
        'X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires', 'X-Amz-SignedHeaders', 'X-Amz-Signature'
    ]

    const presignedQueryString = presignedkey.map(key => (key + "=" + queryObj[key]))

    // s3Path need to change to your origin s3 path;
    var s3Path = "cloudfront-lab-bucket-733217066645.s3.ap-southeast-1.amazonaws.com"

    var presignedUrl = "https://" + s3Path + uri + "?" + presignedQueryString.join("&")

    console.log("Method UriToS3Key | presignedUrl: " + JSON.stringify(presignedUrl))

    var presignedAccessVerify = false;

    try {
        const verifyResult = await presignedAccess(presignedUrl);
        presignedAccessVerify = verifyResult == 200
        if (presignedAccessVerify) {
            console.log("presignedUrl verified for :" + JSON.stringify(presignedUrl))
        }
        else{
            var errorMessage = "Error while get images with invalid presignedUrl: " + presignedUrl + "\n";
            console.log("Method UriToS3Key | presignedUrl verify failed for:" + JSON.stringify(presignedUrl))
            return {
                status: 403,
                statusDescription: 'Not Found',
                body: errorMessage,
                bodyEncoding: 'text',
                headers: {
                    'content-type': [{key: 'Content-Type', value: 'text/plain'}]
                }
            }
        }
    } catch (ex) {
        console.log("Method UriToS3Key | presignedAccess with error: " + JSON.stringify(ex))
    }

    request.uri = key
    request.querystring = [
        `nextExtension=${nextExtension}`,
        `height=${height}`,
        `sourceImage=${prefix}/${imageName}.${prevExtension}`,
        `width=${width}`
    ].join('&')

    console.log("Event Response from UriToS3Key: \n" + JSON.stringify(request))

    return request
}

const presignedAccess = async (presignedUrl) => {
    try {
        console.log("Method presignedAccess | start")
        const result = await axios.get(presignedUrl)
        return result.status
    } catch (e) {
        console.log("Method presignedAccess | axios get object from s3 error: " + JSON.stringify(e))
    }

}

module.exports = UriToS3Key
