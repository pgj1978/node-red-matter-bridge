const {logEndpoint, EndpointServer} = require( "@matter/main")

const { hasProperty, isNumber } = require('./utils');


module.exports = function(RED) {
    function MatterDimmableLight(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.bridge = RED.nodes.getNode(config.bridge);
        node.name = config.name
        node.range = config.range
        node.levelstep = Number(config.levelstep)
        node.pending = false
        node.pendingmsg = null
        node.passthrough = /^true$/i.test(config.passthrough)
        this.log(`Loading Device node ${node.id}`)
        node.status({fill:"red",shape:"ring",text:"not running"});
        this.on('input', function(msg) {
            this.log(node.levelstep)
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
                if (node.range == "100"){ msg.payload.level = Math.round(msg.payload.level*2.54)}
                if (hasProperty(msg.payload, 'increaseLevel')){
                    msg.payload.level = node.device.state.levelControl.currentLevel+node.levelstep
                }
                if (hasProperty(msg.payload, 'decreaseLevel')){
                    msg.payload.level = node.device.state.levelControl.currentLevel-node.levelstep
                }
                if (msg.payload.level == undefined) {
                    msg.payload.level = node.device.state.levelControl.currentLevel
                }
                this.log(msg.payload.level)
                msg.payload.level=Math.max(2, Math.min(254, msg.payload.level))
                if (msg.payload.state == undefined || typeof(msg.payload) != "object"){
                    msg.payload = state = {state: msg.payload}
                }
                if (typeof msg.payload.state != "boolean") {
                    switch (msg.payload.state){
                        case '1':
                        case 1:
                        case 'on':
                            msg.payload.state = true
                            break
                        case '0':
                        case 0:
                        case 'off':
                            msg.payload.state = false
                            break
                        case 'toggle':
                            msg.payload.state = !node.device.state.onOff.onOff
                            break
                    }
                }
                this.log(msg.payload)
                //If values are changed then set them & wait for callback otherwise send msg on
                if (msg.payload.state != node.device.state.onOff.onOff || msg.payload.level != node.device.state.levelControl.currentLevel ){
                    node.pending = true
                    node.pendingmsg = msg
                    node.device.set({
                        onOff: {
                            onOff: msg.payload.state,
                        },
                        levelControl: {
                            currentLevel: msg.payload.level
                        }
                    })
                } else{
                    if (node.passthrough){
                        node.send(msg);
                    }
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
                node.send(msg);
            } else if (!node.pending){
                var msg = {payload : {}};
                msg.payload.state = node.device.state.onOff.onOff
                msg.payload.level = node.device.state.levelControl.currentLevel
                if (node.range == "100"){ msg.payload.level = Math.round(msg.payload.level/2.54)}
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

	    this.on('close', async function(removed, done) { 
            let rtype = removed ? 'Device was removed/disabled' : 'Device was restarted'
            this.log(`Closing device: ${this.id}, ${rtype}`)
            await this.device.close()    
            //Remove Node-RED Custom Events
            this.off('state')
            this.off('serverReady')
            this.off('identify')            
            done();
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
    RED.nodes.registerType("matterdimmablelight",MatterDimmableLight);
}
