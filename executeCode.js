class EntryBalam{
  constructor({ socketDomain, perfix, projectID }) {
    this.extentionPerfix = perfix || '[Ex: BALAM]'; // console.log 앞에 붙는 접두사
    this.socketAddr = `wss://${socketDomain || 'entry-balam.herokuapp.com'}/?id=${projectID}`; // socket server 주소

    this.socket = null;
    this.BalamPerfix = undefined;
  }
  init() {
    // 현재 페이지가 올바른 페이지인가
    if (location.hostname !== 'playentry.org' || (location.pathname.split('/')[1].length <= 2 && location.pathname.split('/')[1] !== 'ws') || typeof Entry == "undefined") {
      this.log("에러: 이곳에서는 '바람'을 사용할 수 없습니다.");
      return false;
    }

    this.vc = Entry.variableContainer;

    // 이 프로젝트에서 바람을 사용하는가
    if (!_.some(this.vc.variables_, { name_: 'USE바람' })) {
      this.log("에러: 이 프로젝트는 '바람'을 사용하지 않는 프로젝트입니다.")
      return false;
    }

    this.socketConnect(); // WebSocket 연결

    // 작품을 실행했을 때
    Entry.addEventListener('run', () => {
      // 작품 변수에서 필요한 정보 추출.
      this.BalamPerfix = _.find(this.vc.variables_, { name_: "USE바람" }).getValue();
    })

    // EntryJS 블록 실행 코드 변경
    // (변수)를 (값)으로 정하기
    Entry.block.set_variable.func = (sprite, script) => {
      const variableId = script.getField('VARIABLE', script);
      const value = script.getValue('VALUE', script);
      const variable = Entry.variableContainer.getVariable(variableId, sprite);
      if (this.isTargetUsingBalam(variable)) {
        this.sendSocket('setVariable', { id: variableId, sprite: sprite }, value);
      } else {
        variable.setValue(value);
      }
      return script.callReturn();
    }
    // (변수)에 (값)만큼 더하기
    Entry.block.change_variable.func = (sprite, script) => {
      const variableId = script.getField('VARIABLE', script);
      let value = script.getValue('VALUE', script);
      let fixed = 0;

      if (value == false && typeof value === 'boolean') {
        throw new Error('Type is not correct');
      }

      const variable = Entry.variableContainer.getVariable(variableId, sprite);

      if (this.isTargetUsingBalam(variable)) {
        this.sendSocket('changeVariable', { id: variableId, sprite: sprite }, value);
      } else {
        let variableValue = variable.getValue();
        let sumValue;
        if (Entry.Utils.isNumber(value) && variable.isNumber()) {
          value = Entry.parseNumber(value);
          variableValue = Entry.parseNumber(variableValue);
          fixed = Entry.getMaxFloatPoint([value, variable.getValue()]);
          sumValue = new BigNumber(value)
            .plus(variableValue)
            .toNumber()
            .toFixed(fixed);
        } else {
          sumValue = `${variableValue}${value}`;
        }
        variable.setValue(sumValue);
      }
      return script.callReturn();
    }
    // (값) 항목을 (리스트)에 추가하기
    Entry.block.add_value_to_list.func = (sprite, script) => {
      const listId = script.getField('LIST', script);
      const value = script.getValue('VALUE', script);
      const list = Entry.variableContainer.getList(listId, sprite);

      if (this.isTargetUsingBalam(list)) {
        this.sendSocket('pushList', { id: listId, sprite: sprite }, value);
      } else {
        if (!list.array_) {
          list.array_ = [];
        }
  
        list.array_.push({ data: value });
        list.updateView();
      }
      return script.callReturn();
    }
    // (값)번째 항목을 (리스트)에서 삭제하기
    Entry.block.remove_value_from_list.func = (sprite, script) => {
      const listId = script.getField('LIST', script);
      const value = script.getValue('VALUE', script);
      const list = Entry.variableContainer.getList(listId, sprite);

      if (
        !list.array_ ||
        !Entry.Utils.isNumber(value) ||
        value > list.array_.length
      ) {
        throw new Error('can not remove value from array');
      }

      if (this.isTargetUsingBalam(list)) {
        this.sendSocket('removeList', { id: listId, sprite: sprite }, value);
      } else {
        list.array_.splice(value - 1, 1);

        list.updateView();
      }
      return script.callReturn();
    }
    // (값)을 (리스트)의 (값)번째에 넣기
    Entry.block.insert_value_to_list.func = (sprite, script) => {
      const listId = script.getField('LIST', script);
      const [data, index] = script.getValues(['DATA', 'INDEX'], script);
      const list = Entry.variableContainer.getList(listId, sprite);

      if (
        !list.array_ ||
        !Entry.Utils.isNumber(index) ||
        index == 0 ||
        index > list.array_.length + 1
      ) {
        throw new Error('can not insert value to array');
      }
      if (this.isTargetUsingBalam(list)) {
        this.sendSocket('insertList', { id: listId, sprite: sprite }, { data: data, index: index });
      } else {
        list.array_.splice(index - 1, 0, { data });
        list.updateView();
      }
      return script.callReturn();
    }
    // (리스트)의 (값)번째 항목을 (값)으로 바꾸기
    Entry.block.change_value_list_index.func = (sprite, script) => {
      const listId = script.getField('LIST', script);
      const [data, index] = script.getValues(['DATA', 'INDEX'], script);
      const list = Entry.variableContainer.getList(listId, sprite);

      if (
        !list.array_ ||
        !Entry.Utils.isNumber(index) ||
        index > list.array_.length
      ) {
        throw new Error('can not insert value to array');
      }

      if (this.isTargetUsingBalam(list)) {
        this.sendSocket('changeList', { id: listId, sprite: sprite }, { data: data, index: index });
      } else {
        list.array_[index - 1].data = data;
        list.updateView();
      }
      return script.callReturn();
    }
    // (신호) 보내기
    Entry.block.message_cast.func = (sprite, script) => {
      const value = script.getField('VALUE', script);

      const arr = Entry.variableContainer.messages_;
      const isExist = Entry.isExist(value, 'id', arr);

      if (value == 'null' || !isExist) {
        throw new Error('value can not be null or undefined');
      }

      if (_.find(arr, { id: value }).name.startsWith(this.BalamPerfix)) {
        this.sendSocket('message', { id: value }, {});
      } else {
        setTimeout(function () {
          Entry.engine.raiseMessage(value);
        });
      }

    }

    this.log('활성화 완료.');
    return true;
  }
  // log with extentionPerfix
  log(...msg) {
    console.log(this.extentionPerfix, ...msg)
  }
  // socket 연결
  socketConnect() {
    this.socket = new WebSocket(this.socketAddr);

    this.socket.onopen = () => {
      this.log('WebSocket 연결됨.')
    };
    this.socket.onerror = (err) => {
      this.log('WebSocket 에러:', err.message);
      ws.close();
    };
    this.socket.onclose = (evt) => {
      this.log('WebSocket 연결이 끊어짐.', evt.reason);
      if (evt.reason !== 'disable') {
        // 의도적이지 않게 연결이 끊기면 1000ms 후 다시 연결함.
        setTimeout(() => {
          this.log('WebSocket 재연결 시도.');
          this.socketConnect();
        }, 1000);
      }
    }
    this.socket.onmessage = (evt) => {
      const message = JSON.parse(evt.data);
      this.log('데이터 받음:', message);

      if (Entry.engine.state === 'run') { // 작품이 실행중이면
        // 받은 메세지를 타입별로 구분 후 처리
        switch (message.type) {
          case 'variable':
            const variable = this.vc.getVariable(message.target.id, message.target.sprite);
            variable.setValue(message.value);
            break;
          case 'list':
            const list = this.vc.getList(message.target.id, message.target.sprite);
            list.array_ = message.value;
            list.updateView();
          case 'message':
            Entry.engine.raiseMessage(message.target.id);
          default:
            break;
        }
      }
    }
  }
  // socket이 연결되어 있는지 확인.
  isSocketOpen() {
    return this.socket.readyState === WebSocket.OPEN;
  }
  // socket으로 메세지 보내기 
  sendSocket(type, target, value) { // target: 변경된 변수(,리스트, 신호)
    if (this.isSocketOpen()) { // WebSocket이 연결되어 있다면 
      // 보낼 message
      const message = {
        type: type,
        target: target,
        value: value
      }

      // WebSocket.send 예외 처리
      let isErr = false;
      try {
        this.socket.send(JSON.stringify(message));
      } catch (e) {
        this.log('WebSocket으로 데이터를 전송하는데 에러가 발생함.', e);
        isErr = true;
      }
      finally {
        if (!isErr) this.log('WebSocket으로 데이터 전송함:', message);
      }
    }
  }
  // 대상이 '바람'을 사용하는지 확인.
  isTargetUsingBalam(target) {
    return target.name_.startsWith(this.BalamPerfix)
  }
}

let entryBalam = new EntryBalam({ projectID: Entry.projectId });

if (entryBalam.init()) entrylms.alert("성공적으로 활성화 되었습니다!\n서버 연결까지 시간이\n다소 소요될 수 있습니다.", "엔트리 비공식 확장기능 '바람'");
else entrylms.alert("'바람'을 설치하는 중 오류가 발생했습니다.", "엔트리 비공식 확장기능 '바람'");