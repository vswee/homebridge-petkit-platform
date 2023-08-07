const BaseAccessory = require('./baseaccessory')

let Accessory;
let Service;
let Characteristic;
let UUIDGen;

class LitterBoxAccessory extends BaseAccessory {
  constructor(platform, homebridgeAccessory, deviceConfig) {

    ({ Accessory, Characteristic, Service } = platform.api.hap);
    super(
      platform,
      homebridgeAccessory,
      deviceConfig,
      Accessory.Categories.FAN,
      Service.Fanv2
    );
    this.statusArr= deviceConfig.state ? deviceConfig.state : {};
    this.deviceType = deviceConfig.type;
    this.deviceId = deviceConfig.id;
    //support feeder switchs & sensors
    this.addService(Service.Switch, "Cleaning");
    this.addService(Service.Light, "Light");
    this.addService(Service.Switch, "Deodorising");
    this.addService(Service.OccupancySensor, "Box");
    this.addService(Service.OccupancySensor, "Litter Bin");

    this.refreshAccessoryServiceIfNeed(this.statusArr, false);
  }

  //addService function
  addService(serviceType, name) {
    // Service
    var service = this.homebridgeAccessory.getService(name);
    if (service) {
      service.setCharacteristic(Characteristic.Name, name);
    } else {
      // add new service
      this.homebridgeAccessory.addService(serviceType, name, name);
    }
  }

  //init Or refresh AccessoryService
  refreshAccessoryServiceIfNeed(statusArr, isRefresh) {
    this.isRefresh = isRefresh;

    let service = this.homebridgeAccessory.getService("Cleaning");
    this.eventAsync(Characteristic.On, false, service);
    let blk_d = null;
    console.log(">>>>>>>>>>>>statusArr:", statusArr);
    for (const [key, value] of Object.entries(statusArr)) {
      switch (key) {
        // case 'errorCode':
        //   blk_d = statusArr[statusMap] === 'blk_d' ? 1 : 0;
        case 'box':
          service = this.homebridgeAccessory.getService("Box");
          this.normalAsync(Characteristic.OccupancyDetected, value, service);
          break;
        case 'boxFull':
          service = this.homebridgeAccessory.getService("Litter Bin");
          this.normalAsync(Characteristic.OccupancyDetected, value, service);
          break;
        default:
          break;
      }
    }
  }

  normalAsync(name, hbValue, service = null) {
    const key = service.displayName + "-" + name.UUID;
    this.setCachedState(key, hbValue);
    if (this.isRefresh) {
      (service ? service : this.service)
        .getCharacteristic(name)
        .updateValue(hbValue);
    } else {
      this.getAccessoryCharacteristic(name, service);
    }
  }

  eventAsync(name, hbValue, service = null) {
    // console.log(">>>>>>>>>>>>>>service:", service)
    const key = service.displayName + "-" + name.UUID;
    this.setCachedState(key, hbValue);
    if (this.isRefresh) {
      (service ? service : this.service)
        .getCharacteristic(name)
        .sendEventNotification(hbValue);
    } else {
      this.getAccessoryCharacteristic(name, service);
    }
  }

  getAccessoryCharacteristic(name, service = null) {
    const key = service.displayName + "-" + name.UUID;
    //set  Accessory service Characteristic
    (service ? service : this.service).getCharacteristic(name)
      .on('get', callback => {
        if (this.hasValidCache()) {
          callback(null, this.getCachedState(key));
        }
      })
      .on('set', async (value, callback) => {
        const command = this.controlDevice(name, value);   
        this.platform.petkitOpenApi.sendCommand(command).then(async () => {
          this.setCachedState(key, value);
          const device = await this.refreshDevice();
          this.updateState(device, true);
          callback();
        }).catch((error) => {
          this.log.error('[SET][%s] Characteristic Error: %s', this.homebridgeAccessory.displayName, error);
          this.invalidateCache();
          callback(error);
        });
      });
  }

  async refreshDevice() {
    await this.platform.petkitOpenApi.login(this.platform.petkitOpenApi.username, this.platform.petkitOpenApi.password);
    const device = await this.platform.petkitOpenApi.getDeviceDetail(this.deviceType, this.deviceId);
    return device;
  }
  controlDevice(name, value) {
    let command;
    let now = new Date();
    let day = now.getFullYear() + '' + now.getMonth() + '' + now.getDate();
    let id = this.deviceId
    let kv = { "start_action": 7 }
    let type = "start"
    switch (name) {
      case Characteristic.On:
        path = "/" + this.deviceType.toLowerCase() + "/controlDevice";
        params = {
          'id': id,
          'day':day,
          'kv': kv,
          'type': type
        };
        command = {
          'path': path,
          'params': params
        }
        break;
      default:
        break;
    }
    return command;
  }
  getSendParam(name, hbValue) {
    let command;
    let path;
    let params;
    switch (name) {
      case Characteristic.On:
        let now = new Date();
        let day = now.getFullYear() + '' + now.getMonth() + '' + now.getDate();
        path = "/" + this.deviceType.toLowerCase() + "/saveDailyFeed";
        params = {
          'amount': amount,
          'day': date.toISOString().split('T')[0].replace('-','').replace('-',''),
          'deviceId': this.deviceId,
          'time': -1
        };
        command = {
          'path': path,
          'params': params
        }
        break;
      default:
        break;
    }
    return command;
  }

  //update device status
  updateState(data) {
    this.refreshAccessoryServiceIfNeed(data.state, true);
  }
}

module.exports = LitterBoxAccessory;
