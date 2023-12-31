const path = require('path')
const yaml = require('yaml')
const fs = require('fs-extra')

const pathOfPublic = path.join(__dirname, '..', `public`)

const pathOfDist = path.join(__dirname, '..', `dist`)

const pathOfDistV4 = path.join(pathOfDist, 'v4')

const pathOfSourceDirectory = path.join(pathOfPublic, 'v4')
const pathOfSourceDirectoryApps = path.join(pathOfSourceDirectory, 'apps')
const pathOfSourceDirectoryLogos = path.join(pathOfSourceDirectory, 'logos')

/**
 * Creates a listing of apps for GET https://apps.caprover.gocloud.fun/v4
 * {
    "oneClickApps": [
     {
      "name": "adminer",
      "displayName": "Adminer",
      "description": "Adminer (formerly phpMinAdmin) is a full-featured database management tool written in PHP",
      "isOfficial": true,
      "logoUrl": "adminer.png"
     },.....]}
 */
function createAppList(appsFileNames, pathOfApps) {
    const apps = appsFileNames.filter((v) => `${v}`.endsWith('.yml'))

    if (apps.length !== appsFileNames.length) {
        throw new Error('All files in v4 must end with .yml extension!')
    }

    const appDetails = []

    for (var i = 0; i < apps.length; i++) {
        const contentString = fs.readFileSync(
            path.join(pathOfApps, apps[i]),
            'utf-8'
        )
        const content = yaml.parse(contentString)
        const captainVersion = `${content.captainVersion}`

        apps[i] = apps[i].replace('.yml', '')
        const caproverOneClickApp = content.caproverOneClickApp

        if (captainVersion === '4') {
            if (!caproverOneClickApp.displayName) {
                caproverOneClickApp.displayName = apps[i]
                caproverOneClickApp.displayName =
                    caproverOneClickApp.displayName.substr(0, 1).toUpperCase() +
                    caproverOneClickApp.displayName.substring(
                        1,
                        caproverOneClickApp.displayName.length
                    )
            }
            if (!caproverOneClickApp.description)
                caproverOneClickApp.description = ''

            appDetails[i] = {
                name: apps[i],
                displayName: caproverOneClickApp.displayName,
                description: caproverOneClickApp.description,
                isOfficial:
                    `${caproverOneClickApp.isOfficial}`.toLowerCase().trim() ===
                    'true',
                logoUrl: apps[i] + '.png',
            }
        } else {
            throw new Error('Unknown captain-version: ' + captainVersion)
        }
    }

    return {
        appList: apps,
        appDetails: appDetails,
    }
}

function convertV4toV2(v4String) {
    const parsed = JSON.parse(v4String)
    if (`${parsed.captainVersion}` !== '4') {
        throw new Error('CaptainVersion must be 4 for this conversion')
    }

    function moveProperty(propertyName) {
        parsed[propertyName] = parsed.caproverOneClickApp[propertyName]
    }

    parsed.dockerCompose = {
        services: parsed.services,
    }
    parsed.services = undefined

    parsed.captainVersion = 2

    moveProperty('variables')
    moveProperty('instructions')
    moveProperty('displayName')
    moveProperty('isOfficial')
    moveProperty('description')
    moveProperty('documentation')

    Object.keys(parsed.dockerCompose.services).forEach((serviceName) => {
        const service = parsed.dockerCompose.services[serviceName]

        if (!service.caproverExtra) {
            return
        }

        if (service.caproverExtra.containerHttpPort) {
            service.containerHttpPort = service.caproverExtra.containerHttpPort
        }
        if (service.caproverExtra.dockerfileLines) {
            service.dockerfileLines = service.caproverExtra.dockerfileLines
        }
        if (service.caproverExtra.notExposeAsWebApp) {
            service.notExposeAsWebApp = service.caproverExtra.notExposeAsWebApp
        }

        service.caproverExtra = undefined
    })

    parsed.caproverOneClickApp = undefined
    return parsed
}

function buildDist() {
    return fs
        .readdir(pathOfSourceDirectoryApps)
        .then(function (appsFileNames) {
            // [ app1.yml app2.yml .... ]

            appsFileNames.forEach((appFileName) => {
                console.log('Building dist for ' + appFileName)

                const pathOfAppFileInSource = path.join(
                    pathOfSourceDirectoryApps,
                    appFileName
                )
                const contentParsed = yaml.parse(
                    fs.readFileSync(pathOfAppFileInSource, 'utf-8')
                )

                //v4
                fs.outputJsonSync(
                    path.join(pathOfDistV4, `apps`, appFileName.split('.')[0]),
                    contentParsed
                )
            })

            fs.copySync(
                pathOfSourceDirectoryLogos,
                path.join(pathOfDistV4, `logos`)
            )

            const allAppsList = createAppList(
                appsFileNames,
                pathOfSourceDirectoryApps
            )
            const v3List = {
                oneClickApps: allAppsList.appDetails,
            }

            fs.outputJsonSync(path.join(pathOfDistV4, 'list'), v3List)
        })
        .then(function () {
            return fs.copySync(
                path.join(pathOfPublic, 'CNAME'),
                path.join(pathOfDist, 'CNAME')
            )
        })
}

Promise.resolve()
    .then(function () {
        return buildDist()
    })
    .catch(function (err) {
        console.error(err)
        process.exit(127)
    })
