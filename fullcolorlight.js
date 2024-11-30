const {logEndpoint, EndpointServer} = require( "@matter/main")

const { hasProperty, isNumber } = require('./utils');


module.exports = function(RED) {
    function MatterFullColorLight(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.bridge = RED.nodes.getNode(config.bridge);
        node.name = config.name
        node.range = config.range
        node.pending = false
        node.pendingmsg = null
        node.passthrough = /^true$/i.test(config.passthrough)
        node.tempformat = config.tempformat || "kelvin" //Default to kelvin for legacy
        node.levelstep = Number(config.levelstep)
        this.log(`Loading Device node ${node.id}`)
        node.status({fill:"red",shape:"ring",text:"not running"});
        this.on('input', function(msg) {
            if (msg.topic == 'state'){
                msg.payload = node.device.state
                node.send(msg)
                logEndpoint(EndpointServer.forEndpoint(node.bridge.matterServer))
            } else {    
                node.pending = true
                node.pendingmsg = msg
                if (msg.payload.state == undefined) {
                    msg.payload.state = node.device.state.onOff.onOff
                }
                if (hasProperty(msg.payload, 'increaseLevel')){
                    msg.payload.level = node.device.state.levelControl.currentLevel+node.levelstep
                }
                if (hasProperty(msg.payload, 'decreaseLevel')){
                    msg.payload.level = node.device.state.levelControl.currentLevel-node.levelstep
                }
                if (msg.payload.level == undefined) {
                    msg.payload.level = node.device.state.levelControl.currentLevel
                }
                else {
                    if (node.range == "100"){ msg.payload.level = Math.round(msg.payload.level*2.54)}
                }
                if ((hasProperty(msg.payload, 'hue') || hasProperty(msg.payload, 'sat')) && hasProperty(msg.payload, 'temp')) {
                    node.error("Can't set Colour Temp and Hue/Sat at same time")
                } else {
                    if (hasProperty(msg.payload, 'hue') || hasProperty(msg.payload, 'sat')){
                        msg.payload.hue = msg.payload.hue ? msg.payload.hue : node.device.state.colorControl.currentHue
                        msg.payload.sat = msg.payload.sat ? msg.payload.sat : node.device.state.colorControl.currentSaturation
                        newcolor = {
                            colorMode: 0,
                            currentHue: msg.payload.hue,
                            currentSaturation: msg.payload.sat
                        }
                    } else if (hasProperty(msg.payload, 'temp')) {
                        if (node.tempformat == 'kelvin'){
                            var mireds = 1000000/msg.payload.temp
                        } else {
                            var mireds = msg.payload.temp
                        } 
                        newcolor = {
                            colorMode: 2,
                            colorTemperatureMireds : mireds
                        }
                    }
                    else {
                            newcolor = {colorMode: node.device.state.colorControl.colorMode}
                    }
                }
                node.device.set({
                    levelControl: {
                        currentLevel: Math.max(2, Math.min(254, msg.payload.level))
                    },
                    colorControl: newcolor
                })
                
                switch (msg.payload.state){
                    case '1':
                    case 1:
                    case 'on':
                    case true:
                        node.device.set({
                            onOff: {
                                onOff: true,
                            }
                        })
                        break
                    case '0':
                    case 0:
                    case 'off':
                    case false:
                        node.device.set({
                            onOff: {
                                onOff: false,
                            }
                        })
                        break
                    case 'toggle':
                        node.device.set({
                            onOff: {
                                        onOff: !node.device.state.onOff.onOff,
                                    }
                        })
                        break
                    
                }
            }
        });
        this.on('serverReady', function() {
            this.status({fill:"green",shape:"dot",text:"ready"});
        })
        this.on('state', function(data){
            if ((node.pending && node.passthrough)) {
                var msg = node.pendingmsg
                msg.payload.state = node.device.state.onOff.onOff
                msg.payload.level = node.device.state.levelControl.currentLevel
                if (node.range == "100"){ msg.payload.level = Math.round(msg.payload.level/2.54)}
                if (node.device.state.colorControl.colorMode == 0){
                    msg.payload.hue = node.device.state.colorControl.currentHue
                    msg.payload.sat = node.device.state.colorControl.currentSaturation
                }
                else if (node.device.state.colorControl.colorMode == 2){
                    if (node.tempformat == 'kelvin'){
                        msg.payload.temp = Math.floor(1000000/node.device.state.colorControl.colorTemperatureMireds)
                    } else {
                        msg.payload.temp = node.device.state.colorControl.colorTemperatureMireds
                    } 
                } else {
                    node.error(`Unknown color mode: ${node.device.state.colorControl.colorMode}`)
                }
                node.send(msg);
            } else if (!node.pending){
                var msg = {payload : {}};
                msg.payload.state = node.device.state.onOff.onOff
                msg.payload.level = node.device.state.levelControl.currentLevel
                if (node.range == "100"){ msg.payload.level = Math.round(msg.payload.level/2.54)}
                if (node.device.state.colorControl.colorMode == 0){
                    msg.payload.hue = node.device.state.colorControl.currentHue
                    msg.payload.sat = node.device.state.colorControl.currentSaturation
                }
                else if (node.device.state.colorControl.colorMode == 2){
                    msg.payload.temp = Math.floor(1000000/node.device.state.colorControl.colorTemperatureMireds)
                } else {
                    node.error(`Unknown color mode: ${node.device.state.colorControl.colorMode}`)
                }
                
                node.send(msg);
            }
            node.pending = false
        })

        this.on('identify', function(data){
            if (data){
                this.status({fill:"blue",shape:"dot",text:"identify"});
            } else {
                this.status({fill:"green",shape:"dot",text:"ready"});
            }
            
        })

        this.on('close', function(removed, done) {
            this.log("Closing device "+this.id)
            this.off('state')
            this.off('serverReady')
            this.off('identify')
            this.device.close().then(() => {
                done();
            })
        });
        
        //Wait till server is started
        function waitforserver(node) {
            if (!node.bridge.serverReady) {
              setTimeout(waitforserver, 100, node)
            } else {
                node.log('Registering Child......')
                node.bridge.emit('registerChild', node)
            }
        }
        waitforserver(node)
        

    }
    RED.nodes.registerType("matterfullcolorlight",MatterFullColorLight);
}