'use strict'

const AWS = require('aws-xray-sdk').captureAWS(require('aws-sdk'))
const Sharp = require('sharp')
const {parse} = require('querystring')

const S3 = new AWS.S3()

const GetOrCreateImage = async event => {
    const {
        cf: {
            request: {
                origin: {
                    s3: {
                        domainName
                    }
                },
                querystring,
                uri
            },
            response,
            response: {
                status
            }
        }
    } = event.Records[0]

    console.log("Event params from GetOrCreateImage: \n" + JSON.stringify(event))

    if (!['403', '404'].includes(status)) {
        console.log("Event Response from GetOrCreateImage with status 403/404: \n" + JSON.stringify(response))
        return response
    }

    try {
        console.log("Method GetOrCreateImage | queryString: " + querystring + " \n parse(querystring): " + JSON.stringify(parse(querystring)))
        let {nextExtension, height, sourceImage, width} = parse(querystring)
        const [bucket] = domainName.match(/.+(?=\.s3\..*\.amazonaws\.com)/i)
        const contentType = 'image/' + nextExtension
        const key = uri.replace(/^\//, '')
        const sourceKey = sourceImage.replace(/^\//, '')

        height = parseInt(height, 10) || null
        width = parseInt(width, 10)

        if (!width) {
            console.log("Event Response without any change with no width key: \n" + JSON.stringify(response))
            return response
        }

        return S3.getObject({Bucket: bucket, Key: sourceKey})
            .promise()
            .then(imageObj => {
                let resizedImage
                const errorMessage = `Error while resizing "${sourceKey}" to "${key}":`

                // Required try/catch because Sharp.catch() doesn't seem to actually catch anything.
                try {
                    resizedImage = Sharp(imageObj.Body)
                        .resize(width, height)
                        .toFormat(nextExtension, {
                            /**
                             * @see https://sharp.pixelplumbing.com/api-output#webp for a list of options.
                             */
                            quality: 95
                        })
                        .toBuffer()
                        .catch(error => {
                            console.log(errorMessage)
                            throw new Error(`${errorMessage} ${error}`)
                        })
                } catch (error) {
                    throw new Error(`${errorMessage} ${error}`)
                }
                return resizedImage
            })
            .then(async imageBuffer => {
                /* resized picture not save, every time will got 403 or 404 error
                await S3.putObject({
                    Body: imageBuffer,
                    Bucket: bucket,
                    ContentType: contentType,
                    Key: key,
                    StorageClass: 'STANDARD'
                })
                    .promise()
                    .catch(error => {
                        console.log(`Error while putting resized image '${uri}' into bucket: ${error}`)
                        throw new Error(`Error while putting resized image '${uri}' into bucket: ${error}`)
                    })
                */

                return {
                    ...response,
                    status: 200,
                    statusDescription: 'Found',
                    body: imageBuffer.toString('base64'),
                    bodyEncoding: 'base64',
                    headers: {
                        ...response.headers,
                        'content-type': [{key: 'Content-Type', value: contentType}]
                    }
                }
            })
            .catch(error => {
                const errorMessage = `Error while getting source image object "${sourceKey}": ${error}`
                console.log(errorMessage)
                return {
                    ...response,
                    status: 404,
                    statusDescription: 'Not Found',
                    body: errorMessage,
                    bodyEncoding: 'text',
                    headers: {
                        ...response.headers,
                        'content-type': [{key: 'Content-Type', value: 'text/plain'}]
                    }
                }
            })
    } catch (e) {
        console.log("Event GetOrCreateImage error: \n" + e.toString())
        throw e
    }
}

module.exports = GetOrCreateImage
