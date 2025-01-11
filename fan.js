const {logEndpoint, EndpointServer} = require( "@matter/main")

const { hasProperty, willUpdate } = require('./utils');


module.exports = function(RED) {
    function MatterFan(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.bridge = RED.nodes.getNode(config.bridge);
        node.name = config.name
        node.levelstep = Number(config.levelstep)
        node.pending = false
        node.pendingmsg = null
        node.passthrough = /^true$/i.test(config.passthrough)
        node.bat = config.bat    
        node.topic = config.topic || false    
        this.log(`Loading Device node ${node.id}`)
        node.status({fill:"red",shape:"ring",text:"not running"});
        node.stateEvt = function(value, oldValue, context) {
            let eventSource = {}
            if (hasProperty(context, 'offline')) {
                eventSource.local = true
            } else {
                eventSource.local = false
                eventSource.srcAddress = context.exchange.channel.channel.peerAddress
                eventSource.srcPort = context.exchange.channel.channel.peerPort
                eventSource.fabric = node.bridge.matterServer.state.commissioning.fabrics[context.fabric]
            }
            if ((node.pending && node.passthrough)) {
                var msg = node.pendingmsg
                msg.eventSource = eventSource
                msg.payload.mode = node.device.state.fanControl.fanMode
                msg.payload.percent = node.device.state.fanControl.percentSetting
                msg.payload.direction = node.device.state.fanControl.airflowDirection
                msg.payload.rock = node.device.fanControl.state.fanControl.rockSetting.rockLeftRight
                node.send(msg);
            } else if (!node.pending){
                var msg = {payload : {}};
                if (node.topic) {msg.topic = node.topic}
                msg.eventSource = eventSource
                msg.payload.mode = node.device.state.fanControl.fanMode
                msg.payload.percent = node.device.state.fanControl.percentSetting
                msg.payload.direction = node.device.state.fanControl.airflowDirection
                msg.payload.rock = node.device.state.fanControl.rockSetting.rockLeftRight
                node.send(msg);
            }
            node.pending = false
        };
        node.identifying = false
        node.identifyEvt = function() {
            node.identifying = !node.identifying
            if (node.identifying){
                node.status({fill:"blue",shape:"dot",text:"identify"});
            } else {
                node.status({fill:"green",shape:"dot",text:"ready"});
            }
        };


        this.on('input', function(msg) {
            switch (msg.topic) {
                case 'state':
                     if (hasProperty(msg, 'payload')) {
                         node.device.set(msg.payload)
                     }
                     if (config.wires.length != 0){
                         msg.payload = node.device.state
                         node.send(msg)
                     } else{
                         node.error((node.device.state));
                     }
                     break;
                 case 'battery':
                     if (node.bat){
                         node.device.set({
                             powerSource: {
                                 batChargeLevel: msg.battery.batChargeLevel
                             }
                         })
                     }
                     break
                default:
                    node.pending = true
                    node.pendingmsg = msg
                    if (msg.payload.mode == undefined) {
                        msg.payload.mode = node.device.state.fanControl.fanMode
                    }
                    if (hasProperty(msg.payload, 'increaseLevel')){
                        msg.payload.percent = node.device.state.fanControl.percentSetting+node.levelstep
                    }
                    if (hasProperty(msg.payload, 'decreaseLevel')){
                        msg.payload.percent = node.device.state.fanControl.percentSetting-node.levelstep
                    }
                    if (msg.payload.percent == undefined) {
                        msg.payload.percent = node.device.state.fanControl.percentSetting
                    }
                    if (msg.payload.state == undefined || typeof(msg.payload) != "object"){
                        msg.payload = state = {state: msg.payload}
                    }
                    if (msg.payload.direction == undefined) {
                        msg.payload.direction = node.device.state.fanControl.airflowDirection
                    }
                    if (msg.payload.rock == undefined) {
                        msg.payload.rock = node.device.state.fanControl.rockSetting.rockLeftRight
                    }
                    let newData = {
                        fanControl: {
                            fanMode: msg.payload.mode,
                            percentSetting: msg.payload.percent,
                            airflowDirection: msg.payload.direction,
                            rockSetting :  {rockLeftRight: msg.payload.rock }
                        },
                    }
                    //If values are changed then set them & wait for callback otherwise send msg on
                    if (willUpdate.call(node.device, newData)) {
                        node.debug(`WILL update, ${newData}`)
                        node.pending = true
                        node.pendingmsg = msg
                        node.device.set(newData).catch((err) => {node.debug(err); node.error('Invalid Input')})
                    } else {
                        node.debug(`WONT update, ${newData}`)
                        if (node.passthrough){
                            node.send(msg);
                        }
                    }
                    break
            }
        });


        this.on('serverReady', function() {
        var node = this
        node.device.events.fanControl.fanMode$Changed.on(node.stateEvt)
        node.device.events.fanControl.percentSetting$Changed.on(node.stateEvt)
        node.device.events.fanControl.airflowDirection$Changed.on(node.stateEvt)
        node.device.events.fanControl.rockSetting$Changed.on(node.stateEvt)
        node.device.events.identify.startIdentifying.on(node.identifyEvt)
        node.device.events.identify.stopIdentifying.on(node.identifyEvt)
        node.status({fill:"green",shape:"dot",text:"ready"});    
        })

	    this.on('close', async function(removed, done) {
            let node = this
            let rtype = removed ? 'Device was removed/disabled' : 'Device was restarted'
            node.log(`Closing device: ${this.id}, ${rtype}`)
            //Remove Matter.js  Events
            await node.device.events.identify.startIdentifying.off(node.identifyEvt)
            await node.device.events.identify.stopIdentifying.off(node.identifyEvt)
            await node.device.events.fanControl.fanMode$Changed.off(node.stateEvt)
            await node.device.events.fanControl.percentSetting$Changed.off(node.stateEvt)
            await node.device.events.fanControl.airflowDirection$Changed.off(node.stateEvt)
            await node.device.events.fanControl.rockSetting$Changed.off(node.stateEvt)
            //Remove Node-RED Custom  Events
            node.removeAllListeners('serverReady')
            //Remove from Bridge Node Registered
            let index = node.bridge.registered.indexOf(node);
            if (index > -1) { 
                node.bridge.registered.splice(index, 1); 
            }
            if (removed){
                await node.device.close()
            }
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
    RED.nodes.registerType("matterfan",MatterFan);
}
