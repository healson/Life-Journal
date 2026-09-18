from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Todo, User
from ..schemas import TodoCreate, TodoOut, TodoUpdate

router = APIRouter(prefix="/api/todos", tags=["todos"])


def _get_owned_todo(db: Session, user: User, todo_id: int) -> Todo:
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.owner_id == user.id).first()
    if todo is None:
        raise HTTPException(status_code=404, detail="待办不存在")
    return todo


@router.get("", response_model=list[TodoOut])
def list_todos(
    status_: Optional[str] = Query(None, alias="status"),
    priority: Optional[int] = None,
    due_from: Optional[str] = None,
    due_to: Optional[str] = None,
    entry_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Todo).filter(Todo.owner_id == user.id)
    if status_:
        query = query.filter(Todo.status == status_)
    if priority is not None:
        query = query.filter(Todo.priority == priority)
    if due_from:
        query = query.filter(Todo.due_date >= due_from)
    if due_to:
        query = query.filter(Todo.due_date <= due_to)
    if entry_id is not None:
        query = query.filter(Todo.entry_id == entry_id)
    rows = query.order_by(Todo.created_at.desc()).all()
    return rows


@router.post("", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
def create_todo(
    body: TodoCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    todo = Todo(owner_id=user.id, **body.model_dump())
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.put("/{todo_id}", response_model=TodoOut)
def update_todo(
    todo_id: int,
    body: TodoUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    todo = _get_owned_todo(db, user, todo_id)
    data = body.model_dump(exclude_unset=True)
    if "status" in data:
        from ..models import utcnow
        todo.status = data["status"]
        todo.completed_at = utcnow() if data["status"] == "done" else None
        del data["status"]
    for key, value in data.items():
        setattr(todo, key, value)
    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    todo = _get_owned_todo(db, user, todo_id)
    db.delete(todo)
    db.commit()
    return None


@router.post("/{todo_id}/complete", response_model=TodoOut)
def complete_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from ..models import utcnow
    todo = _get_owned_todo(db, user, todo_id)
    if todo.status == "done":
        todo.status = "pending"
        todo.completed_at = None
    else:
        todo.status = "done"
        todo.completed_at = utcnow()
    db.commit()
    db.refresh(todo)
    return todo
